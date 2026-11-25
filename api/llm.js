const { ask } = require("../lib/model");
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const { system, user, schema } = req.body || {};
  try { res.status(200).json({ ok: true, ...(await ask(system, user, schema)) }); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
};
