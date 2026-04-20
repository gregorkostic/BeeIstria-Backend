const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  proizvod: { type: Object, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);