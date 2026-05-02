import cpOwnerWithdrawalRoutes from "./routes/cpOwnerWithdrawalRoutes.js";
import adminWithdrawalRoutes from "./routes/adminWithdrawalRoutes.js";

// Child panel withdrawal
app.use("/api/child-panel", authMiddleware, childPanelOnly, updateLastSeen, cpOwnerWithdrawalRoutes);

// Admin withdrawal management
app.use("/api/admin/withdrawals", authMiddleware, adminOnly, adminWithdrawalRoutes);
