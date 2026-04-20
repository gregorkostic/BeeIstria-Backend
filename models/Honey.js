const mongoose = require('mongoose');

const honeySchema = new mongoose.Schema({
  naziv: { type: String, required: true },
  cijena: { type: Number, required: true },
  seller: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Honey', honeySchema);