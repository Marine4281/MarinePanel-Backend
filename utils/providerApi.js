import axios from "axios";

/**
 * 🔥 Centralized Provider API Caller
 * - Handles all provider requests
 * - Standardizes errors
 * - Prevents duplication
 */
export const callProvider = async (providerProfile, payload) => {
  try {
    if (!providerProfile?.apiUrl || !providerProfile?.apiKey) {
      throw new Error("Invalid provider configuration");
    }

    const params = new URLSearchParams();

    // ✅ Always include API key
    params.append("key", providerProfile.apiKey);

    // ✅ Append payload
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });

    const response = await axios.post(providerProfile.apiUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    });

    // ✅ Basic validation
    if (!response || typeof response.data === "undefined") {
      throw new Error("Invalid provider response");
    }

    return response.data;

  } catch (error) {
    console.error("❌ Provider API Error:", error.response?.data || error.message);

    throw error.response?.data || {
      message: error.message || "Provider request failed",
    };
  }
};
