import axios from "axios";

/**
 * Send order to SMM provider (Peaker, JAP, etc.)
 */
export const sendOrderToProvider = async ({
  apiUrl,
  apiKey,
  serviceId,
  link,
  quantity,
}) => {
  try {
    const response = await axios.post(apiUrl, {
      key: apiKey,
      action: "add",
      service: serviceId,
      link,
      quantity,
    });

    return response.data;
  } catch (error) {
    console.error("Provider API error:", error.response?.data || error.message);
    throw new Error("Failed to send order to provider");
  }
};