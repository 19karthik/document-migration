const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const api_key = process.env.API_KEY;

const generateBasicAuth = (username, password) => {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return auth;
};
const studioEndpoint = async ({
  zipFilePath,
  import_id,
  file_type,
  emp_id_or_user_id,
}) => {
  try {
    const form = new FormData();
    form.append("api_key", api_key);
    form.append("import_id", import_id);
    form.append("file_type", file_type);
    form.append("emp_id_or_user_id", emp_id_or_user_id);
    form.append("zip_file", fs.createReadStream(zipFilePath));

    const response = await axios.post(
      "https://alpha.darwinbox.in/importapi/importdata",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Basic ${generateBasicAuth("LS", "Ls@12345")}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error forwarding to Darwinbox:", error);
    return {
      error: "Failed to forward to Darwinbox",
      message: error.message,
      details: error.response?.data || null,
    };
  }
}

module.exports = studioEndpoint;