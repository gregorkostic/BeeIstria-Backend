require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');

// Importanje modela
const User = require('./models/User');
const Honey = require('./models/Honey');
const Experience = require('./models/Experience');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// ----------------- SPAJANJE NA MONGODB -----------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Spojen na MongoDB'))
  .catch(err => console.error('❌ Greška kod spajanja na MongoDB:', err));

// ----------------- AUTH MIDDLEWARE -----------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token nedostaje' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token nije validan' });
    req.user = user;
    next();
  });
}

// ----------------- AUTENTIKACIJA -----------------

// Registracija
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nedostaje username ili password' });

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Korisnik već postoji' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, password: hashedPassword });

    const token = jwt.sign({ id: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ message: 'Registracija uspješna', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška kod registracije' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nedostaje username ili password' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Neispravni podaci za prijavu' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Neispravni podaci za prijavu' });

    const token = jwt.sign({ id: user._id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ message: `Korisnik ${username} prijavljen.`, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška kod prijave' });
  }
});

// ----------------- KOŠNICE I INFORMACIJE (statični podaci) -----------------

app.get('/kosnice', (req, res) => {
  res.json({
    kosnice: [
      { id: 1, brojPcela: 20000, status: 'zdrava' },
      { id: 2, brojPcela: 18000, status: 'u pripremi za medenje' },
    ]
  });
});

app.get('/informacije/pcelarstvo', (req, res) => {
  res.json({
    tekst: "Pčelarstvo je grana poljoprivrede koja se bavi uzgojem pčela radi dobivanja meda, voska i drugih proizvoda."
  });
});

app.get('/informacije/pcelarstvo/kalendar', (req, res) => {
  res.json({
    kalendar: [
      { mjesec: "Ožujak", aktivnost: "Pregled košnica nakon zime" },
      { mjesec: "Travanj", aktivnost: "Dodavanje nastavaka" }
    ]
  });
});

// ----------------- VREMENSKI UVJETI -----------------

app.post('/vrijeme', async (req, res) => {
  const { lokacija } = req.body;
  if (!lokacija) return res.status(400).json({ error: 'Nedostaje ime lokacije' });

  try {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lokacija)}&count=1&language=hr`;
    const geocodeResponse = await axios.get(geocodeUrl);
    const locationData = geocodeResponse.data.results?.[0];

    if (!locationData) return res.status(404).json({ error: 'Lokacija nije pronađena' });

    const { latitude, longitude, name, country } = locationData;

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=celsius`;
    const weatherResponse = await axios.get(weatherUrl);
    const weatherData = weatherResponse.data.current_weather;

    res.json({
      lokacija: `${name}, ${country}`,
      temperatura: `${weatherData.temperature}°C`,
      vjetar: `${weatherData.windspeed} m/s`,
      uvjeti: weatherData.weathercode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Došlo je do pogreške pri dohvaćanju podataka' });
  }
});

// ----------------- ISKUSTVA (KOMENTARI) -----------------

app.post('/iskustva', authenticateToken, async (req, res) => {
  const { tekst, medId } = req.body;
  if (!tekst || !medId) return res.status(400).json({ error: 'Nedostaje tekst ili medId' });

  try {
    const med = await Honey.findById(medId);
    if (!med) return res.status(404).json({ error: 'Med nije pronađen' });

    const experience = await Experience.create({
      username: req.user.username,
      tekst,
      medId
    });

    res.json({ message: "Iskustvo dodano", experience });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška kod dodavanja iskustva' });
  }
});

app.get('/iskustva', async (req, res) => {
  try {
    const experiences = await Experience.find().populate('medId');
    res.json({ experiences });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod dohvata iskustava' });
  }
});

app.get('/med/:id/iskustva', async (req, res) => {
  try {
    const med = await Honey.findById(req.params.id);
    if (!med) return res.status(404).json({ error: 'Med nije pronađen' });

    const iskustva = await Experience.find({ medId: req.params.id });
    res.json({ med, iskustva });
  } catch (err) {
    res.status(500).json({ error: 'Greška' });
  }
});

app.put('/iskustva/:id', authenticateToken, async (req, res) => {
  const { tekst } = req.body;
  if (!tekst) return res.status(400).json({ error: 'Nedostaje novi tekst' });

  try {
    const updated = await Experience.findByIdAndUpdate(
      req.params.id,
      { tekst },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Komentar nije pronađen' });
    res.json({ message: 'Komentar ažuriran', exp: updated });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod ažuriranja' });
  }
});

app.delete('/iskustva/:id', authenticateToken, async (req, res) => {
  try {
    const deleted = await Experience.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Komentar nije pronađen' });
    res.json({ message: 'Komentar obrisan', deleted });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod brisanja' });
  }
});

// ----------------- MED (PRODAJA) -----------------

app.post('/med', authenticateToken, async (req, res) => {
  const { naziv, cijena } = req.body;
  if (!naziv || !cijena) return res.status(400).json({ error: 'Nedostaje naziv ili cijena' });

  try {
    const med = await Honey.create({
      naziv,
      cijena,
      seller: req.user.username
    });
    res.json({ message: "Med unesen", med });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod unosa meda' });
  }
});

app.get('/med', async (req, res) => {
  try {
    const ponuda = await Honey.find();
    res.json({ ponuda });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod dohvata ponude' });
  }
});

// Brisanje meda (samo vlasnik može obrisati svoj med)
app.delete('/med/:id', authenticateToken, async (req, res) => {
  try {
    const med = await Honey.findById(req.params.id);
    if (!med) return res.status(404).json({ error: 'Med nije pronađen' });

    if (med.seller !== req.user.username) {
      return res.status(403).json({ error: 'Nemate dozvolu obrisati tuđi med' });
    }

    await Honey.findByIdAndDelete(req.params.id);
    res.json({ message: 'Med obrisan', med });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška kod brisanja' });
  }
});

// ----------------- KUPOVINA -----------------

app.post('/kupovina', authenticateToken, async (req, res) => {
  const { medId } = req.body;
  if (!medId) return res.status(400).json({ error: 'Nedostaje medId' });

  try {
    const selected = await Honey.findById(medId);
    if (!selected) return res.status(404).json({ error: 'Med nije pronađen' });

    const transaction = await Transaction.create({
      username: req.user.username,
      proizvod: selected
    });

    res.json({ message: `Korisnik ${req.user.username} je kupio ${selected.naziv}`, transaction });
  } catch (err) {
    res.status(500).json({ error: 'Greška kod kupovine' });
  }
});

app.post('/transakcija', authenticateToken, (req, res) => {
  const { iznos } = req.body;
  if (!iznos) return res.status(400).json({ error: 'Nedostaje iznos' });
  res.json({ message: `Transakcija uspješna!`, korisnik: req.user.username, iznos });
});

// ----------------- POKRETANJE SERVERA -----------------

app.listen(PORT, () => {
  console.log(`🐝 Beelestria app listening on port ${PORT}`);
});