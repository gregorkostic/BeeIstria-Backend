const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
  username: { type: String, required: true },
  tekst: { type: String, required: true },
  medId: { type: mongoose.Schema.Types.ObjectId, ref: 'Honey', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Experience', experienceSchema);