function digitsOnly(value = "") {
  return String(value).replace(/\D/g, "");
}

function getConfiguredPaymentMethods() {
  const gopayNumber = digitsOnly(process.env.PAYMENT_GOPAY_NUMBER);
  const gopayAccountName = String(process.env.PAYMENT_GOPAY_ACCOUNT_NAME || "").trim();
  const seaBankAccountNumber = digitsOnly(process.env.PAYMENT_SEABANK_ACCOUNT_NUMBER);
  const seaBankAccountName = String(process.env.PAYMENT_SEABANK_ACCOUNT_NAME || "").trim();

  return {
    gopay: gopayNumber.length >= 10 && gopayNumber.length <= 15 && gopayAccountName
      ? { method: "gopay", label: "GoPay", recipientNumber: gopayNumber, recipientName: gopayAccountName }
      : null,
    seabank: seaBankAccountNumber.length >= 10 && seaBankAccountNumber.length <= 16 && seaBankAccountName
      ? {
          method: "seabank",
          label: "SeaBank",
          recipientNumber: seaBankAccountNumber,
          recipientName: seaBankAccountName,
        }
      : null,
  };
}

export function getAvailablePaymentMethods() {
  return Object.values(getConfiguredPaymentMethods())
    .filter(Boolean)
    .map(({ method, label }) => ({ method, label }));
}

export function getPaymentInstructions(method, amount, orderNumber) {
  const configured = getConfiguredPaymentMethods()[method];
  if (!configured || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return {
    method: configured.method,
    label: configured.label,
    recipientNumber: configured.recipientNumber,
    recipientName: configured.recipientName,
    amount,
    orderNumber,
    deadline: null,
  };
}
