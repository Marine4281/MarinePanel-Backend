// controllers/cpOwnerFinancialController.js
//
// Financial dashboard for Child Panel Owners.
// Mirrors admin financialController.js but scoped to THIS
// child panel's users, resellers, orders, and wallet only.
// No child-panel-of-child-panel support (that doesn't exist).

import axios from "axios";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import ProviderProfile from "../models/ProviderProfile.js";

// ─── Helpers ──────────────────────────────────────────────────────
const calcBalance = (txns = []) =>
  txns
    .filter((t) => t.status === "Completed")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

const startOfDay   = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const startOfWeek  = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); };
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const startOfYear  = () => new Date(new Date().getFullYear(), 0, 1);
const last7Days    = () => new Date(Date.now() - 7 * 864e5);

const buildDateGte = (range, customStart) => {
  if (range === "custom" && customStart) return new Date(customStart);
  return { today: startOfDay, thisWeek: startOfWeek, thisMonth: startOfMonth, thisYear: startOfYear, last7: last7Days }[range]?.() ?? null;
};

// ─── GET /api/cp/financial/summary ────────────────────────────────
export const getCPFinancialSummary = async (req, res) => {
  try {
    const cpOwner = req.user; // the logged-in CP owner

    // Users who belong to this CP owner
    const cpUsers = await User.find({ childPanelOwner: cpOwner._id })
      .select("_id isReseller")
      .lean();
    const cpUserIds = cpUsers.map((u) => u._id);
    const cpResellerIds = cpUsers.filter((u) => u.isReseller).map((u) => u._id);

    // Provider wallet balances for THIS CP's providers
    const cpProviders = await ProviderProfile.find({ cpOwner: cpOwner._id }).lean();
    const providerBalances = await Promise.all(
      cpProviders.map(async (p) => {
        try {
          const params = new URLSearchParams({ key: p.apiKey, action: "balance" });
          const { data } = await axios.post(p.apiUrl, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 8000,
          });
          return { provider: p.name, balance: data?.balance ?? "N/A", currency: data?.currency ?? "USD", status: "ok" };
        } catch {
          return { provider: p.name, balance: "Error", currency: "USD", status: "error" };
        }
      })
    );

    // Balance used today by CP's users
    const todayOrders = await Order.find({
      userId: { $in: cpUserIds },
      createdAt: { $gte: startOfDay() },
    }).select("charge").lean();
    const balanceUsedToday = todayOrders.reduce((s, o) => s + (o.charge || 0), 0);

    // Total wallet balance of CP's users
    const userWallets = await Wallet.find({ user: { $in: cpUserIds } }).lean();
    const totalUsersWalletBalance = userWallets.reduce(
      (s, w) => s + Math.max(0, calcBalance(w.transactions)), 0
    );

    // CP owner's own wallet balance
    const ownerWallet = await Wallet.findOne({ user: cpOwner._id }).lean();
    const ownerBalance = Math.max(0, calcBalance(ownerWallet?.transactions ?? []));

    // Reseller summary
    const resellerWallets = await Wallet.find({ user: { $in: cpResellerIds } }).lean();
    const resellerTotalBalance = resellerWallets.reduce(
      (s, w) => s + Math.max(0, calcBalance(w.transactions)), 0
    );

    res.json({
      providerBalances,
      balanceUsedToday:       Number(balanceUsedToday.toFixed(4)),
      totalUsersWalletBalance: Number(totalUsersWalletBalance.toFixed(4)),
      ownerBalance:           Number(ownerBalance.toFixed(4)),
      reseller: {
        total:        cpResellerIds.length,
        totalBalance: Number(resellerTotalBalance.toFixed(4)),
      },
      commission: cpOwner.childPanelCommission ?? 0,
    });
  } catch (err) {
    console.error("CP FINANCIAL SUMMARY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/cp/financial/profit ─────────────────────────────────
export const getCPProfit = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { range = "thisMonth", customStart, customEnd, country = "All" } = req.query;

    // Get all user IDs under this CP owner
    const cpUsers = await User.find({ childPanelOwner: cpOwner._id }).select("_id country").lean();
    const cpUserIds = cpUsers.map((u) => u._id);

    let matchStage = {
      userId:     { $in: cpUserIds },
      status:     "completed",
      isFreeOrder: { $ne: true },
    };

    const gte = buildDateGte(range, customStart);
    if (gte) {
      matchStage.createdAt = { $gte: gte };
      if (range === "custom" && customEnd) matchStage.createdAt.$lte = new Date(customEnd);
    }

    // Country filter: build a set of userIds in that country
    let filteredUserIds = cpUserIds;
    if (country !== "All") {
      filteredUserIds = cpUsers.filter((u) => u.country === country || u.countryCode === country).map((u) => u._id);
      matchStage.userId = { $in: filteredUserIds };
    }

    const currentCommission = cpOwner.childPanelCommission ?? 0;

    const [summary, chart] = await Promise.all([
      Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalCharge: { $sum: "$charge" },
            totalProfit: {
              $sum: {
                $cond: [
                  { $gt: ["$cpOwnerProfit", 0] },
                  "$cpOwnerProfit",
                  { $multiply: ["$charge", { $divide: [currentCommission, 100] }] },
                ],
              },
            },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            dailyCharge: { $sum: "$charge" },
            dailyProfit: {
              $sum: {
                $cond: [
                  { $gt: ["$cpOwnerProfit", 0] },
                  "$cpOwnerProfit",
                  { $multiply: ["$charge", { $divide: [currentCommission, 100] }] },
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totalProfit = summary[0]?.totalProfit ?? 0;
    const totalCharge = summary[0]?.totalCharge ?? 0;

    res.json({
      profit:       Number(totalProfit.toFixed(4)),
      grossRevenue: Number(totalCharge.toFixed(4)),
      totalOrders:  summary[0]?.totalOrders ?? 0,
      commission:   currentCommission,
      chart: chart.map((d) => ({
        date:   d._id,
        profit: Number((d.dailyProfit ?? 0).toFixed(4)),
        orders: d.count,
      })),
    });
  } catch (err) {
    console.error("CP PROFIT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/cp/financial/users ──────────────────────────────────
export const getCPFinancialUsers = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const cpUsersRaw = await User.find({ childPanelOwner: cpOwner._id })
      .select("email phone country countryCode createdAt isReseller isSuspended")
      .lean();

    const wallets = await Wallet.find({ user: { $in: cpUsersRaw.map((u) => u._id) } }).lean();
    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.user.toString()] = calcBalance(w.transactions); });

    const users = cpUsersRaw
      .map((u) => ({ ...u, balance: Math.max(0, walletMap[u._id.toString()] ?? 0) }))
      .sort((a, b) => b.balance - a.balance);

    const total = users.length;
    const paginated = users.slice(skip, skip + Number(limit));

    res.json({ data: paginated, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("CP FINANCIAL USERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── GET /api/cp/financial/reseller-earnings ──────────────────────
export const getCPResellerEarnings = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const resellers = await User.find({ childPanelOwner: cpOwner._id, isReseller: true })
      .select("_id email phone country createdAt isSuspended")
      .lean();

    const resellerIds = resellers.map((r) => r._id);

    const [wallets, orderStats] = await Promise.all([
      Wallet.find({ user: { $in: resellerIds } }).lean(),
      Order.aggregate([
        { $match: { resellerOwner: { $in: resellerIds }, status: "completed" } },
        {
          $group: {
            _id:             "$resellerOwner",
            totalOrders:     { $sum: 1 },
            totalCharge:     { $sum: "$charge" },
            totalCommission: { $sum: "$resellerCommission" },
          },
        },
      ]),
    ]);

    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.user.toString()] = Math.max(0, calcBalance(w.transactions)); });

    const statsMap = {};
    orderStats.forEach((s) => { statsMap[s._id.toString()] = s; });

    const data = resellers.map((r) => {
      const id    = r._id.toString();
      const stats = statsMap[id] ?? {};
      return {
        ...r,
        walletBalance:  walletMap[id] ?? 0,
        totalOrders:    stats.totalOrders ?? 0,
        totalCharge:    Number((stats.totalCharge ?? 0).toFixed(4)),
        totalEarnings:  Number((stats.totalCommission ?? 0).toFixed(4)),
      };
    });

    data.sort((a, b) => b.totalEarnings - a.totalEarnings);

    const total = data.length;
    res.json({
      data: data.slice(skip, skip + Number(limit)),
      total, page: Number(page), pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("CP RESELLER EARNINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/cp/financial/withdrawals ────────────────────────────
// CP owner sees withdrawal requests from THEIR resellers, just like
// admin sees CP owner withdrawal requests.
export const getCPWithdrawals = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Get all resellers under this CP owner
    const resellers = await User.find({
      childPanelOwner: cpOwner._id,
      isReseller: true,
    }).select("_id email").lean();

    const resellerIds = resellers.map((r) => r._id);
    const resellerMap = {};
    resellers.forEach((r) => { resellerMap[r._id.toString()] = r; });

    const wallets = await Wallet.find({ user: { $in: resellerIds } }).lean();

    const all = [];
    wallets.forEach((wallet) => {
      wallet.transactions?.forEach((tx) => {
        if (tx.type !== "Withdrawal") return;
        if (status && tx.status !== status) return;
        const reseller = resellerMap[wallet.user.toString()];
        all.push({
          walletId:  wallet._id,
          txId:      tx._id,
          userId:    wallet.user,
          email:     reseller?.email ?? "—",
          amount:    Math.abs(tx.amount),
          status:    tx.status,
          note:      tx.note ?? "",
          createdAt: tx.createdAt,
        });
      });
    });

    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = all.length;
    const paginated = all.slice(skip, skip + Number(limit));

    res.json({ data: paginated, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("CP WITHDRAWALS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// ─── POST /api/cp/financial/withdrawals/:userId/:txId/approve ─────
export const cpApproveWithdrawal = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { userId, txId } = req.params;

    // Verify this reseller belongs to this CP owner
    const reseller = await User.findOne({ _id: userId, childPanelOwner: cpOwner._id, isReseller: true });
    if (!reseller) return res.status(403).json({ message: "Not authorized" });

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const tx = wallet.transactions.id(txId);
    if (!tx || tx.type !== "Withdrawal") return res.status(404).json({ message: "Withdrawal not found" });
    if (tx.status !== "Pending") return res.status(400).json({ message: "Withdrawal is not pending" });

    tx.status = "Completed";
    wallet.balance = wallet.transactions
      .filter((t) => t.status === "Completed")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    await wallet.save();

    const io = req.app.get("io");
    if (io) io.emit("wallet:update", { userId, balance: wallet.balance });

    res.json({ success: true, message: "Withdrawal approved" });
  } catch (err) {
    console.error("CP APPROVE WITHDRAWAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/cp/financial/withdrawals/:userId/:txId/reject ──────
export const cpRejectWithdrawal = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { userId, txId } = req.params;
    const { reason } = req.body;

    const reseller = await User.findOne({ _id: userId, childPanelOwner: cpOwner._id, isReseller: true });
    if (!reseller) return res.status(403).json({ message: "Not authorized" });

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const tx = wallet.transactions.id(txId);
    if (!tx || tx.type !== "Withdrawal") return res.status(404).json({ message: "Withdrawal not found" });
    if (tx.status !== "Pending") return res.status(400).json({ message: "Withdrawal is not pending" });

    // Refund: reverse the deduction by adding a positive Completed transaction
    tx.status = "Failed";
    wallet.transactions.push({
      type:      "Withdrawal Refund",
      amount:    Math.abs(tx.amount),
      status:    "Completed",
      note:      reason ? `Rejected: ${reason}` : "Withdrawal rejected",
      createdAt: new Date(),
    });

    wallet.balance = wallet.transactions
      .filter((t) => t.status === "Completed")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    await wallet.save();

    const io = req.app.get("io");
    if (io) io.emit("wallet:update", { userId, balance: wallet.balance });

    res.json({ success: true, message: "Withdrawal rejected and amount refunded" });
  } catch (err) {
    console.error("CP REJECT WITHDRAWAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/cp/financial/withdrawals/:userId/:txId/status ─────
export const cpSetWithdrawalStatus = async (req, res) => {
  try {
    const cpOwner = req.user;
    const { userId, txId } = req.params;
    const { status } = req.body;

    const allowed = ["Completed", "Failed", "Processing"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use: Completed, Failed, Processing" });
    }

    const reseller = await User.findOne({ _id: userId, childPanelOwner: cpOwner._id, isReseller: true });
    if (!reseller) return res.status(403).json({ message: "Not authorized" });

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const tx = wallet.transactions.id(txId);
    if (!tx || tx.type !== "Withdrawal") return res.status(404).json({ message: "Withdrawal not found" });

    const previous = tx.status;
    tx.status = status;

    wallet.balance = wallet.transactions
      .filter((t) => t.status === "Completed")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    await wallet.save();

    const io = req.app.get("io");
    if (io) io.emit("wallet:update", { userId, balance: wallet.balance });

    res.json({ success: true, message: `Status changed from ${previous} → ${status}` });
  } catch (err) {
    console.error("CP SET WITHDRAWAL STATUS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
