const { hasKey } = require("../lib/model");
module.exports = (req, res) => res.status(200).json({
  ok: true, keyPresent: hasKey(), openalexKey: !!process.env.OPENALEX_API_KEY });
