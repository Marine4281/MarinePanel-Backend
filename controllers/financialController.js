// controllers/financialController.js
import axios from "axios";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import ProviderProfile from "../models/ProviderProfile.js";
import Settings from "../models/Settings.js";

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

// ─── GET /api/admin/financial/summary ─────────────────────────────
export const getFinancialSummary = async (req, res) => {
  try {
    // Provider wallet balances
    const profiles = await ProviderProfile.find({ cpOwner: null }).lean();
    const providerBalances = await Promise.all(
      profiles.map(async (p) => {
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

    // Balance used today (sum of charges on orders created today, any status)
    const todayOrders = await Order.find({ createdAt: { $gte: startOfDay() } }).select("charge").lean();
    const balanceUsedToday = todayOrders.reduce((s, o) => s + (o.charge || 0), 0);

    // Total wallet balance across ALL users
    const allWallets = await Wallet.find({}).lean();
    const totalUsersWalletBalance = allWallets.reduce((s, w) => s + Math.max(0, calcBalance(w.transactions)), 0);

    // Child panel summary
    const cpOwners = await User.find({ isChildPanel: true }).select("_id childPanelBrandName childPanelActivatedAt childPanelMonthlyFee childPanelPerOrderFee").lean();
    const cpIds = cpOwners.map((u) => u._id);

    const [cpActivations, cpWallets] = await Promise.all([
      User.countDocuments({ isReseller: true, childPanelOwner: { $in: cpIds } }),
      Wallet.find({ user: { $in: cpIds } }).lean(),
    ]);

    // Total activation fees collected from child panels (CP Activation Fee transactions)
    let cpTotalActivationFees = 0;
    let cpTotalBalance = 0;
    cpWallets.forEach((w) => {
      cpTotalBalance += Math.max(0, calcBalance(w.transactions));
      w.transactions?.forEach((t) => {
        if (t.type === "CP Activation Fee" && t.status === "Completed") {
          cpTotalActivationFees += Math.abs(Number(t.amount) || 0);
        }
      });
    });

    // Reseller summary
    const resellerUsers = await User.find({ isReseller: true }).select("_id").lean();
    const resellerIds = resellerUsers.map((u) => u._id);
    const resellerWallets = await Wallet.find({ user: { $in: resellerIds } }).lean();
    let resellerTotalBalance = 0;
    resellerWallets.forEach((w) => { resellerTotalBalance += Math.max(0, calcBalance(w.transactions)); });

    const settings = await Settings.findOne().lean();

    res.json({
      providerBalances,
      balanceUsedToday: Number(balanceUsedToday.toFixed(4)),
      totalUsersWalletBalance: Number(totalUsersWalletBalance.toFixed(4)),
      childPanel: {
        totalPanels: cpOwners.length,
        totalActivations: cpActivations,
        totalActivationFees: Number(cpTotalActivationFees.toFixed(4)),
        totalBalance: Number(cpTotalBalance.toFixed(4)),
      },
      reseller: {
        total: resellerUsers.length,
        totalBalance: Number(resellerTotalBalance.toFixed(4)),
      },
      commission: settings?.commission ?? 50,
    });
  } catch (err) {
    console.error("FINANCIAL SUMMARY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/admin/financial/profit ──────────────────────────────
// Query: range=today|thisWeek|last7|thisMonth|thisYear|all|custom
//        customStart=ISO  customEnd=ISO  country=All|KE|US...
export const getProfit = async (req, res) => {
  try {
    const { range = "thisMonth", customStart, customEnd, country = "All" } = req.query;

    const settings = await Settings.findOne().lean();
    const commission = settings?.commission ?? 50;

    let matchStage = { status: "completed" };

    const gte = buildDateGte(range, customStart);
    if (gte) {
      matchStage.createdAt = { $gte: gte };
      if (range === "custom" && customEnd) matchStage.createdAt.$lte = new Date(customEnd);
    }

    // Country filter via lookup
    let pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (country !== "All") {
      pipeline.push({ $match: { "user.country": country } });
    }

    pipeline.push(
      {
        $group: {
          _id: null,
          totalCharge: { $sum: "$charge" },
          totalOrders: { $sum: 1 },
        },
      }
    );

    // Chart breakdown by day
    let chartPipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmpty: true } },
    ];
    if (country !== "All") {
      chartPipeline.push({ $match: { "user.country": country } });
    }
    chartPipeline.push(
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          dailyCharge: { $sum: "$charge" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }
    );

    const [summary, chart] = await Promise.all([
      Order.aggregate(pipeline),
      Order.aggregate(chartPipeline),
    ]);

    const totalCharge = summary[0]?.totalCharge ?? 0;
    const profit = (totalCharge * commission) / 100;

    res.json({
      profit: Number(profit.toFixed(4)),
      grossRevenue: Number(totalCharge.toFixed(4)),
      totalOrders: summary[0]?.totalOrders ?? 0,
      commission,
      chart: chart.map((d) => ({
        date: d._id,
        profit: Number(((d.dailyCharge * commission) / 100).toFixed(4)),
        orders: d.count,
      })),
    });
  } catch (err) {
    console.error("PROFIT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/admin/financial/users ───────────────────────────────
// Users sorted by wallet balance descending
export const getFinancialUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const usersRaw = await User.find({}).select("email phone country countryCode createdAt isReseller isChildPanel isSuspended balance").lean();

    const wallets = await Wallet.find({ user: { $in: usersRaw.map((u) => u._id) } }).lean();
    const walletMap = {};
    wallets.forEach((w) => { walletMap[w.user.toString()] = calcBalance(w.transactions); });

    const users = usersRaw
      .map((u) => ({ ...u, balance: Math.max(0, walletMap[u._id.toString()] ?? 0) }))
      .sort((a, b) => b.balance - a.balance);

    const total = users.length;
    const paginated = users.slice(skip, skip + Number(limit));

    res.json({ data: paginated, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("FINANCIAL USERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/admin/financial/withdrawals ─────────────────────────
// All withdrawals (all statuses), with manual control
export const getAllWithdrawals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const cpOwners = await User.find({ isChildPanel: true }).select("_id email childPanelBrandName").lean();
    const ownerMap = {};
    cpOwners.forEach((u) => { ownerMap[u._id.toString()] = u; });

    const wallets = await Wallet.find({ user: { $in: cpOwners.map((u) => u._id) } }).lean();

    const all = [];
    wallets.forEach((wallet) => {
      wallet.transactions?.forEach((tx, idx) => {
        if (tx.type !== "Withdrawal") return;
        if (status && tx.status !== status) return;
        const owner = ownerMap[wallet.user.toString()];
        all.push({
          walletId: wallet._id,
          txIndex: idx,
          txId: tx._id,
          userId: wallet.user,
          email: owner?.email ?? "—",
          brandName: owner?.childPanelBrandName ?? "—",
          amount: Math.abs(tx.amount),
          status: tx.status,
          note: tx.note ?? "",
          createdAt: tx.createdAt,
        });
      });
    });

    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = all.length;
    const paginated = all.slice(skip, skip + Number(limit));

    res.json({ data: paginated, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("ALL WITHDRAWALS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/admin/financial/withdrawals/:userId/:txId/status ──
// Manually set status to Completed | Failed | Processing
export const setWithdrawalStatus = async (req, res) => {
  try {
    const { userId, txId } = req.params;
    const { status } = req.body;

    const allowed = ["Completed", "Failed", "Processing"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use: Completed, Failed, Processing" });
    }

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const tx = wallet.transactions.id(txId);
    if (!tx || tx.type !== "Withdrawal") return res.status(404).json({ message: "Withdrawal not found" });

    const previous = tx.status;
    tx.status = status;

    // Recalculate balance: only Completed transactions count
    wallet.balance =
      wallet.transactions
        .filter((t) => t.status === "Completed")
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    await wallet.save();

    const io = req.app.get("io");
    if (io) io.emit("wallet:update", { userId, balance: wallet.balance });

    res.json({ success: true, message: `Status changed from ${previous} → ${status}` });
  } catch (err) {
    console.error("SET WITHDRAWAL STATUS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/admin/financial/reseller-earnings ───────────────────
export const getResellerEarnings = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const resellers = await User.find({ isReseller: true })
      .select("_id email phone country createdAt isSuspended")
      .lean();

    const resellerIds = resellers.map((r) => r._id);

    const [wallets, orderStats] = await Promise.all([
      Wallet.find({ user: { $in: resellerIds } }).lean(),
      Order.aggregate([
        { $match: { resellerOwner: { $in: resellerIds }, status: "completed" } },
        {
          $group: {
            _id: "$resellerOwner",
            totalOrders: { $sum: 1 },
            totalCharge: { $sum: "$charge" },
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
      const id = r._id.toString();
      const stats = statsMap[id] ?? {};
      return {
        ...r,
        walletBalance: walletMap[id] ?? 0,
        totalOrders: stats.totalOrders ?? 0,
        totalCharge: Number((stats.totalCharge ?? 0).toFixed(4)),
        totalEarnings: Number((stats.totalCommission ?? 0).toFixed(4)),
      };
    });

    // Sort by totalEarnings desc
    data.sort((a, b) => b.totalEarnings - a.totalEarnings);

    const total = data.length;
    res.json({ data: data.slice(skip, skip + Number(limit)), total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("RESELLER EARNINGS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
