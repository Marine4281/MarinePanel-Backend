export const handlePaystackWebhook = async (req, res) => {
  const { event, data } = req.body;

  if (event === "charge.success") {
    const reference = data.reference;
    const transaction = await Wallet.findOne({ "transactions.reference": reference });
    if (!transaction) return res.status(404).send("Transaction not found");

    // Update transaction status
    transaction.transactions = transaction.transactions.map(t =>
      t.reference === reference ? { ...t, status: "Completed", note: "Payment confirmed by Paystack" } : t
    );

    // Recalculate balance
    transaction.balance = transaction.transactions
      .filter(t => t.status === "Completed")
      .reduce((acc, t) => acc + Number(t.amount), 0);

    await transaction.save();

    // Emit socket
    req.app.get("io").emit("wallet:update", {
      userId: transaction.user,
      balance: transaction.balance,
      transactions: transaction.transactions,
    });
  }

  res.sendStatus(200);
};
