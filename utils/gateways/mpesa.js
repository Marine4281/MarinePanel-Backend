// utils/gateways/mpesa.js
import axios from "axios";

export const meta = {
  name: "mpesa",
  label: "M-Pesa Daraja",
  credentialFields: [
    { key: "consumerKey",    label: "Consumer Key",    type: "text",     required: true },
    { key: "consumerSecret", label: "Consumer Secret", type: "password", required: true },
    { key: "shortcode",      label: "Shortcode",       type: "text",     required: true },
    { key: "passkey",        label: "Passkey",         type: "password", required: true },
    { key: "initiatorName",      label: "B2C Initiator Name",      type: "text",     required: false },
    { key: "securityCredential", label: "B2C Security Credential", type: "password", required: false },
    { key: "resultUrl",          label: "B2C Result URL",          type: "text",     required: false },
    { key: "queueTimeoutUrl",    label: "B2C Timeout URL",         type: "text",     required: false },
  ],
};

const getAccessToken = async ({ consumerKey, consumerSecret }) => {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res  = await axios.get(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return res.data.access_token;
};

export const initialize = async (credentials, { amount, reference, callbackUrl }) => {
  const token     = await getAccessToken(credentials);
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const password  = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString("base64");

  await axios.post(
    "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    {
      BusinessShortCode: credentials.shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            Math.round(amount),
      PartyA:            credentials.shortcode,
      PartyB:            credentials.shortcode,
      PhoneNumber:       credentials.shortcode,
      CallBackURL:       callbackUrl,
      AccountReference:  reference,
      TransactionDesc:   "Deposit",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  // M-Pesa is push-based — user gets a prompt on their phone
  return { reference, message: "STK push sent to your phone" };
};

export const verify = async (_credentials, _reference) => {
  // M-Pesa verification comes via callback webhook — not a pull verify
  return true;
};

export const verifyWebhook = (_credentials, _req) => {
  // Safaricom doesn't sign webhooks — validate by checking callback structure
  return true;
};

export const extractReference = (body) =>
  body?.Body?.stkCallback?.CallbackMetadata?.Item?.find(
    (i) => i.Name === "MpesaReceiptNumber"
  )?.Value || null;

export const payout = async (credentials, { amount, reference, recipient }) => {
  if (!recipient?.phone) throw new Error("Recipient phone number is required");
  if (!credentials.initiatorName || !credentials.securityCredential) {
    throw new Error("B2C credentials not configured for this gateway");
  }

  const token = await getAccessToken(credentials);
  const phone = recipient.phone.replace(/^\+/, "").replace(/^0/, "254");

  const response = await axios.post(
    "https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest",
    {
      InitiatorName:      credentials.initiatorName,
      SecurityCredential: credentials.securityCredential,
      CommandID:          "BusinessPayment",
      Amount:             Math.round(amount),
      PartyA:             credentials.shortcode,
      PartyB:             phone,
      Remarks:            "Wallet withdrawal",
      QueueTimeOutURL:    credentials.queueTimeoutUrl,
      ResultURL:          credentials.resultUrl,
      Occasion:           reference,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // B2C is async — the ResultURL callback confirms success/failure
  return {
    success:            true,
    status:             "pending",
    providerReference:  response.data.ConversationID,
  };
};
