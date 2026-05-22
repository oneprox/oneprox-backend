/**
 * Normalisasi PPN & total harga tenant: total_price = rent_price + ppn
 */
function normalizeTenantPricing(data = {}, existingRentPrice = null) {
  const rentRaw =
    data.rent_price !== undefined && data.rent_price !== null
      ? Number(data.rent_price)
      : existingRentPrice !== undefined && existingRentPrice !== null
        ? Number(existingRentPrice)
        : 0;

  const ppnRaw =
    data.ppn !== undefined && data.ppn !== null ? Number(data.ppn) : 0;

  const rent_price = Number.isFinite(rentRaw) && rentRaw >= 0 ? rentRaw : 0;
  const ppn = Number.isFinite(ppnRaw) && ppnRaw >= 0 ? ppnRaw : 0;
  const total_price = rent_price + ppn;

  return { rent_price, ppn, total_price };
}

module.exports = { normalizeTenantPricing };
