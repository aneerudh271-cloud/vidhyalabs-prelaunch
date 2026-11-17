/* VidhyaLabs shared data — edit the CONFIG block first. */
window.VL = (function () {
  const config = {
    brand: 'VidhyaLabs',
    tagline: 'Your everyday needs. One platform.',
    phoneDisplay: '+91 74006 37753',
    email: 'hello@vidhyalabs.com',     // EDIT
    areas: ['Indus Town', 'Krishnapuram', 'Radhapuram'],
    cutoff: '9pm',
    slot: '6–8am',
    formEndpoint: '/api'                // Postgres-backed API on this site (api/index.js). See SETUP.md.
  };

  const herd = ('Kokila,Tulsi,Bijli,Savitri,Mangla,Gauri,Heera,Pari,Sundari,Veena,Kapila,Rani,Lalita,Chameli,Narmada,' +
    'Gudiya,Meera,Rohini,Jhumri,Padma,Kali,Sapna,Yashoda,Moti,Usha,Basanti,Gangotri,Kesar,Amba,Radha,Laado,Neelam,' +
    'Sharda,Kiran,Munni,Parvati,Dhawali,Mohini,Seema,Bholi,Godavari,Asha,Kamla,Pushpa,Jaggo,Sheela,Ganga,Nirmala,' +
    'Chandni,Maharani,Surabhi,Ritu,Sona,Kajri,Devaki,Mala,Girija,Lata,Banno,Kamdhenu,Phool,Shyama,Jayanti,Pinky,' +
    'Saraswati,Rajni,Manju,Gulabo,Anjali,Mayuri,Roopa,Bhavani,Sumati,Kaveri,Tara,Laxmi,Champa,Rukmini,Sarla,Mehndi,' +
    'Kalindi,Vimla,Pooja,Bhuri,Gomati,Chanchal,Shanti,Meena,Rajkumari,Ambika,Kajal,Jamuna,Gulab,Lali,Durga,Rekha,' +
    'Nandini,Madhuri,Sita,Sarita').split(',');

  // price:null => confirmed by our team. sub:true => can be daily/weekly/monthly.
  const catalog = [
    // Milk
    { id: 'm-bc-500', img: 'images/bottle-boiled-500.jpg', kind: 'goods', cat: 'milk', name: 'Boiled cow milk', variant: '500 ml', price: 35, emoji: '🥛', sub: true },
    { id: 'm-bc-1000', img: 'images/bottle-boiled-1l.jpg', kind: 'goods', cat: 'milk', name: 'Boiled cow milk', variant: '1 litre', price: 70, emoji: '🥛', sub: true },
    { id: 'm-bb-500', img: 'images/bottle-boiled-500.jpg', kind: 'goods', cat: 'milk', name: 'Boiled buffalo milk', variant: '500 ml', price: 40, emoji: '🥛', sub: true },
    { id: 'm-bb-1000', img: 'images/bottle-boiled-1l.jpg', kind: 'goods', cat: 'milk', name: 'Boiled buffalo milk', variant: '1 litre', price: 75, emoji: '🥛', sub: true },
    { id: 'm-nc-500', img: 'images/bottle-nonboiled-500.jpg', kind: 'goods', cat: 'milk', name: 'Non-boiled cow milk', variant: '500 ml', price: 33, emoji: '🐄', sub: true },
    { id: 'm-nc-1000', img: 'images/bottle-nonboiled-1l.jpg', kind: 'goods', cat: 'milk', name: 'Non-boiled cow milk', variant: '1 litre', price: 65, emoji: '🐄', sub: true },
    { id: 'm-nb-500', img: 'images/bottle-nonboiled-500.jpg', kind: 'goods', cat: 'milk', name: 'Non-boiled buffalo milk', variant: '500 ml', price: 37, emoji: '🐃', sub: true },
    { id: 'm-nb-1000', img: 'images/bottle-nonboiled-1l.jpg', kind: 'goods', cat: 'milk', name: 'Non-boiled buffalo milk', variant: '1 litre', price: 70, emoji: '🐃', sub: true },
    // Vegetables (reference prices from Blinkit listings, 2025; review before launch)
    { id: 'v-tinda', kind: 'goods', cat: 'veg', name: 'Tinda (Round gourd)', variant: '250 g', price: 35, emoji: '🟢' },
    { id: 'v-kundru', kind: 'goods', cat: 'veg', name: 'Kundru (Ivy gourd)', variant: '250 g', price: 31, emoji: '🥒' },
    { id: 'v-gwar', kind: 'goods', cat: 'veg', name: 'Gwar phali (Cluster beans)', variant: '250 g', price: 35, emoji: '🫛' },
    { id: 'v-tori', kind: 'goods', cat: 'veg', name: 'Tori (Sponge gourd)', variant: '250 g', price: 19, emoji: '🥒' },
    { id: 'v-karela', kind: 'goods', cat: 'veg', name: 'Karela (Bitter gourd)', variant: '250–300 g', price: 25, emoji: '🥒' },
    { id: 'v-arvi', kind: 'goods', cat: 'veg', name: 'Arvi', variant: '250–300 g', price: 18, emoji: '🥔' },
    { id: 'v-baingan', kind: 'goods', cat: 'veg', name: 'Baingan (Small purple brinjal)', variant: '250–300 g', price: 15, emoji: '🍆' },
    { id: 'v-sahjan', kind: 'goods', cat: 'veg', name: 'Sahjan (Drumstick)', variant: '250 g', price: 51, emoji: '🥬' },
    { id: 'v-kkela', kind: 'goods', cat: 'veg', name: 'Kacha kela (Raw banana)', variant: '3 pieces', price: 36, emoji: '🍌' },
    { id: 'v-kpapita', kind: 'goods', cat: 'veg', name: 'Kacha papita (Raw papaya)', variant: '1 piece, 400–600 g', price: 34, emoji: '🍈' },
    { id: 'v-bhutta', kind: 'goods', cat: 'veg', name: 'Bhutta (Corn cob)', variant: '1 piece', price: 26, emoji: '🌽' },
    { id: 'v-lauki', kind: 'goods', cat: 'veg', name: 'Lauki (Bottle gourd)', variant: '1 piece, 400–600 g', price: 34, emoji: '🥒' },
    { id: 'v-gollauki', kind: 'goods', cat: 'veg', name: 'Gol lauki (Round bottle gourd)', variant: '1 piece', price: 29, emoji: '🟢' },
    { id: 'v-haldi', kind: 'goods', cat: 'veg', name: 'Kachhi haldi (Raw turmeric)', variant: '250 g', price: 35, emoji: '🫚' },
    { id: 'v-amla', kind: 'goods', cat: 'veg', name: 'Amla', variant: '250 g', price: 63, emoji: '🍏' },
    { id: 'v-gobhi', kind: 'goods', cat: 'veg', name: 'Phool gobhi (Cauliflower)', variant: '1 piece, 400–600 g', price: 103, emoji: '🥦' },
    { id: 'v-gajar', kind: 'goods', cat: 'veg', name: 'Gajar (Carrot)', variant: '200–250 g', price: 17, emoji: '🥕' },
    { id: 'v-aloo', kind: 'goods', cat: 'veg', name: 'Aloo (Potato)', variant: '1 kg', price: 28, emoji: '🥔' },
    { id: 'v-pyaz', kind: 'goods', cat: 'veg', name: 'Pyaz (Onion)', variant: '1 kg', price: 35, emoji: '🧅' },
    { id: 'v-tamatar', kind: 'goods', cat: 'veg', name: 'Tamatar (Tomato)', variant: '500 g', price: 47, emoji: '🍅' },
    // Fruits (reference prices from Blinkit listings, 2025; review before launch)
    { id: 'f-coconut', kind: 'goods', cat: 'fruit', name: 'Tender coconut (Nariyal)', variant: '1 piece', price: 89, emoji: '🥥' },
    { id: 'f-anar', kind: 'goods', cat: 'fruit', name: 'Pomegranate (Anar)', variant: '2 pieces, 350–450 g', price: 133, emoji: '🍎' },
    { id: 'f-mosambi', kind: 'goods', cat: 'fruit', name: 'Sweet lime (Mosambi)', variant: '1 kg, 9–10 pieces', price: 50, emoji: '🍊' },
    { id: 'f-pineapple', kind: 'goods', cat: 'fruit', name: 'Pineapple (Ananas)', variant: '1 piece, 800–1000 g', price: 98, emoji: '🍍' },
    { id: 'f-nashpati', kind: 'goods', cat: 'fruit', name: 'Pear (Nashpati)', variant: '450–550 g', price: 43, emoji: '🍐' },
    { id: 'f-nakh', kind: 'goods', cat: 'fruit', name: 'Pear Nakh, Himachal', variant: '500 g', price: 52, emoji: '🍐' },
    { id: 'f-dragon', kind: 'goods', cat: 'fruit', name: 'Dragon fruit', variant: '1 piece, 300–400 g', price: 74, emoji: '🍈' },
    { id: 'f-papita', kind: 'goods', cat: 'fruit', name: 'Organically grown papaya (Papita)', variant: '0.8–1.4 kg', price: 153, emoji: '🍈' },
    { id: 'f-granny', kind: 'goods', cat: 'fruit', name: 'Granny Smith apple, USA', variant: '2 pieces, 300–400 g', price: 150, emoji: '🍏' },
    { id: 'f-minior', kind: 'goods', cat: 'fruit', name: 'Mini orange', variant: '250 g', price: 101, emoji: '🍊' },
    // Groceries
    { id: 'g-staples', kind: 'goods', cat: 'groceries', name: 'Rice, atta & pulses', variant: 'Tell us brand and quantity', price: null, emoji: '🌾' },
    { id: 'g-kitchen', kind: 'goods', cat: 'groceries', name: 'Oil, sugar, salt & spices', variant: 'Tell us brand and quantity', price: null, emoji: '🧂' },
    { id: 'g-break', kind: 'goods', cat: 'groceries', name: 'Tea, coffee & breakfast', variant: 'Tell us brand and quantity', price: null, emoji: '☕' },
    { id: 'g-snack', kind: 'goods', cat: 'groceries', name: 'Snacks & packaged foods', variant: 'Tell us what you need', price: null, emoji: '🍪' },
    { id: 'g-clean', kind: 'goods', cat: 'groceries', name: 'Household cleaning supplies', variant: 'Tell us what you need', price: null, emoji: '🧴' },
    { id: 'g-care', kind: 'goods', cat: 'groceries', name: 'Personal care products', variant: 'Tell us what you need', price: null, emoji: '🧼' },
    // Dal (reference prices from Blinkit listing, 2026; review before launch)
    { id: 'dal-tata5', kind: 'goods', cat: 'groceries', name: 'Tata Sampann Unpolished Toor Dal', variant: '500 g', price: 98, emoji: '🫘' },
    { id: 'dal-fort5', kind: 'goods', cat: 'groceries', name: 'Fortune Unpolished Arhar / Toor Dal', variant: '500 g', price: 94, emoji: '🫘' },
    { id: 'dal-naf1', kind: 'goods', cat: 'groceries', name: 'NAFED Toor Dal', variant: '1 kg', price: 125, emoji: '🫘' },
    { id: 'dal-raj1', kind: 'goods', cat: 'groceries', name: 'Rajdhani Toor Dal / Arhar Dal', variant: '1 kg', price: 182, emoji: '🫘' },
    { id: 'dal-tatag1', kind: 'goods', cat: 'groceries', name: 'Tata Sampann Unpolished Gulbarga Toor Dal', variant: '1 kg', price: 196, emoji: '🫘' },
    { id: 'dal-mang1', kind: 'goods', cat: 'groceries', name: 'Mangat Ram Unpolished Arhar / Toor Dal', variant: '1 kg', price: 203, emoji: '🫘' },
    // Water
    { id: 'w-bottle', kind: 'goods', cat: 'water', name: 'Packaged drinking water', variant: 'Bottles', price: null, emoji: '💧', sub: true },
    { id: 'w-jar', kind: 'goods', cat: 'water', name: 'Drinking water jar', variant: '20 litre', price: null, emoji: '🫙', sub: true },
    // Newspapers
    { id: 'n-daily', kind: 'goods', cat: 'news', name: 'Daily newspaper', variant: 'Tell us which paper (subject to availability)', price: null, emoji: '🗞️', sub: true },
    // Home services
    { id: 's-clean', img: 'images/cleaning.jpg', kind: 'service', cat: 'cleaning', name: 'Home cleaning', variant: 'Regular, deep, kitchen, bathroom, move-in/out', price: 300, unit: 'per hour', qtyLabel: 'hours', emoji: '🧹' },
    // Vehicle
    { id: 'v-car-ext', img: 'images/carwash.jpg', kind: 'service', cat: 'vehicle', name: 'Car exterior wash', variant: 'Daily, weekly or monthly plans', price: null, emoji: '🚗', sub: true },
    { id: 'v-car-int', img: 'images/carwash.jpg', kind: 'service', cat: 'vehicle', name: 'Car interior cleaning', variant: 'Daily, weekly or monthly plans', price: null, emoji: '🧽', sub: true },
    { id: 'v-bike', img: 'images/carwash.jpg', kind: 'service', cat: 'vehicle', name: 'Bike / scooter wash', variant: 'Daily, weekly or monthly plans', price: null, emoji: '🛵', sub: true },
    // Repairs
    { id: 'r-elec', img: 'images/svc-electrician.jpg', kind: 'service', cat: 'repair', name: 'Electrician', variant: 'Switches, sockets, fans, lighting, wiring, faults', price: 300, unit: 'booking fee', emoji: '💡', fee: true },
    { id: 'r-plumb', img: 'images/svc-plumbing.jpg', kind: 'service', cat: 'repair', name: 'Plumber', variant: 'Taps, leaks, drainage, washbasins, toilets', price: 300, unit: 'booking fee', emoji: '🔧', fee: true },
    { id: 'r-appl', img: 'images/svc-appliance.jpg', kind: 'service', cat: 'repair', name: 'Appliance repair', variant: 'Washing machine, fridge, AC, microwave & more', price: 300, unit: 'booking fee', emoji: '🔌', fee: true }
  ];

  const cats = {
    goods: [{ k: 'all', l: 'All' }, { k: 'milk', l: 'Milk' }, { k: 'veg', l: 'Vegetables' }, { k: 'fruit', l: 'Fruits' }, { k: 'groceries', l: 'Groceries' }, { k: 'water', l: 'Water' }, { k: 'news', l: 'Newspapers' }],
    service: [{ k: 'all', l: 'All' }, { k: 'cleaning', l: 'Cleaning' }, { k: 'vehicle', l: 'Vehicle' }, { k: 'repair', l: 'Repairs' }]
  };

  return { config, herd, catalog, cats };
})();
