/**
 * Normalisasi field penagihan: ppn = amount * ppn_percent, billing_amount = amount + ppn
 * ppn_percent disimpan sebagai fraksi desimal (0.11 = 11%).
 */
function normalizePaymentBillingFields(data) {
  const amountRaw = data.amount;
  const hasAmount = amountRaw !== undefined && amountRaw !== null && amountRaw !== '';
  if (!hasAmount) {
    // Data lama: hanya billing_amount, anggap tanpa PPN
    if (data.billing_amount !== undefined && data.billing_amount !== null && data.billing_amount !== '') {
      const billingAmount = Number(data.billing_amount);
      if (!Number.isNaN(billingAmount) && billingAmount >= 0) {
        return {
          amount: billingAmount,
          ppn_percent: 0,
          ppn: 0,
          billing_amount: billingAmount,
        };
      }
    }
    return {
      amount: data.amount != null ? Number(data.amount) : null,
      ppn_percent: data.ppn_percent != null ? Number(data.ppn_percent) : null,
      ppn: data.ppn != null ? Number(data.ppn) : null,
      billing_amount: data.billing_amount != null ? Number(data.billing_amount) : null,
    };
  }

  const amount = Number(amountRaw);
  if (Number.isNaN(amount) || amount < 0) {
    throw new Error('amount must be a valid number >= 0');
  }

  const ppnPercent =
    data.ppn_percent !== undefined && data.ppn_percent !== null && data.ppn_percent !== ''
      ? Number(data.ppn_percent)
      : 0;
  const safePpnPercent = Number.isNaN(ppnPercent) ? 0 : ppnPercent;

  const ppn = amount * safePpnPercent;
  const billing_amount = amount + ppn;

  return {
    amount,
    ppn_percent: safePpnPercent,
    ppn,
    billing_amount,
  };
}

module.exports = { normalizePaymentBillingFields };
