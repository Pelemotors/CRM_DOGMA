/**
 * שתילת 30 רכבי דמו ל-data/vehicles.json המקומי.
 * מסומנים ב-notes/managerNotes/purchasePrice כדי לוודא ש-AI DTO מסתיר אותם.
 *
 * שימוש: node scripts/seed-demo-vehicles.js
 * דגל: --replace  מוחק רכבי דמו קודמים (systemId 90001–90030) לפני שתילה
 */
import { ensureLocalDirs } from '../src/local-db.js';
import {
  createVehicle,
  getAllVehicles,
  deleteVehicle,
  VEHICLES_FILE,
} from '../src/vehicle-store.js';

ensureLocalDirs();

const DEMO_TAG = 'DEMO_SEED_V1';
const SYSTEM_IDS = Array.from({ length: 30 }, (_, i) => String(90001 + i));

const SPECS = [
  { manufacturer: 'Toyota', model: 'Corolla', trim: 'Sense', year: 2023, price: 129000, km: 28000, categories: ['hybrid'], color: 'לבן', gearbox: 'אוטומט', engineType: 'הייבריד' },
  { manufacturer: 'Toyota', model: 'RAV4', trim: 'Luxury', year: 2022, price: 189000, km: 45000, categories: ['hybrid'], color: 'שחור', gearbox: 'אוטומט', engineType: 'הייבריד', vehicleType: 'SUV' },
  { manufacturer: 'Toyota', model: 'Yaris', trim: 'Design', year: 2021, price: 89000, km: 62000, categories: ['petrol'], color: 'אדום', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Mazda', model: '3', trim: 'Sport', year: 2020, price: 105000, km: 78000, categories: ['petrol'], color: 'כסף', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Mazda', model: 'CX-5', trim: 'Exclusive', year: 2023, price: 175000, km: 22000, categories: ['petrol'], color: 'כחול', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Mazda', model: 'CX-5', trim: 'Comfort', year: 2019, price: 119000, km: 98000, categories: ['petrol'], color: 'אפור', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Hyundai', model: 'Tucson', trim: 'Premium', year: 2024, price: 198000, km: 12000, categories: ['hybrid'], color: 'לבן', gearbox: 'אוטומט', engineType: 'הייבריד', vehicleType: 'SUV' },
  { manufacturer: 'Hyundai', model: 'i30', trim: 'Style', year: 2018, price: 72000, km: 110000, categories: ['petrol'], color: 'שחור', gearbox: 'ידני', engineType: 'בנזין' },
  { manufacturer: 'Hyundai', model: 'Ioniq 5', trim: 'Long Range', year: 2023, price: 215000, km: 18000, categories: ['electric'], color: 'טורקיז', gearbox: 'אוטומט', engineType: 'חשמלי' },
  { manufacturer: 'Kia', model: 'Sportage', trim: 'EX', year: 2022, price: 165000, km: 35000, categories: ['petrol'], color: 'ירוק', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Kia', model: 'Niro', trim: 'EV', year: 2024, price: 205000, km: 8000, categories: ['electric'], color: 'לבן', gearbox: 'אוטומט', engineType: 'חשמלי' },
  { manufacturer: 'Kia', model: 'Picanto', trim: 'LX', year: 2017, price: 45000, km: 135000, categories: ['petrol'], color: 'צהוב', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Skoda', model: 'Octavia', trim: 'Ambition', year: 2021, price: 118000, km: 55000, categories: ['petrol'], color: 'אפור', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Skoda', model: 'Kodiaq', trim: 'Style', year: 2022, price: 195000, km: 40000, categories: ['petrol', 'seats7'], color: 'שחור', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Volkswagen', model: 'Golf', trim: 'Comfortline', year: 2019, price: 95000, km: 88000, categories: ['petrol'], color: 'כחול', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Volkswagen', model: 'Tiguan', trim: 'Highline', year: 2021, price: 155000, km: 60000, categories: ['diesel'], color: 'לבן', gearbox: 'אוטומט', engineType: 'דיזל', vehicleType: 'SUV' },
  { manufacturer: 'Volkswagen', model: 'ID.4', trim: 'Pro', year: 2023, price: 225000, km: 15000, categories: ['electric'], color: 'כסף', gearbox: 'אוטומט', engineType: 'חשמלי', vehicleType: 'SUV' },
  { manufacturer: 'Honda', model: 'Civic', trim: 'Elegance', year: 2020, price: 112000, km: 70000, categories: ['petrol'], color: 'אדום', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Honda', model: 'CR-V', trim: 'Executive', year: 2022, price: 178000, km: 32000, categories: ['hybrid'], color: 'שחור', gearbox: 'אוטומט', engineType: 'הייבריד', vehicleType: 'SUV' },
  { manufacturer: 'Nissan', model: 'Qashqai', trim: 'Tekna', year: 2021, price: 138000, km: 48000, categories: ['petrol'], color: 'כתום', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Nissan', model: 'Leaf', trim: 'Acenta', year: 2020, price: 99000, km: 52000, categories: ['electric'], color: 'לבן', gearbox: 'אוטומט', engineType: 'חשמלי' },
  { manufacturer: 'Ford', model: 'Focus', trim: 'Titanium', year: 2018, price: 68000, km: 102000, categories: ['petrol'], color: 'כחול', gearbox: 'ידני', engineType: 'בנזין' },
  { manufacturer: 'Ford', model: 'Kuga', trim: 'ST-Line', year: 2023, price: 168000, km: 25000, categories: ['hybrid'], color: 'אפור', gearbox: 'אוטומט', engineType: 'הייבריד', vehicleType: 'SUV' },
  { manufacturer: 'Peugeot', model: '3008', trim: 'Allure', year: 2022, price: 148000, km: 38000, categories: ['petrol'], color: 'לבן', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Peugeot', model: '208', trim: 'Active', year: 2019, price: 62000, km: 91000, categories: ['petrol'], color: 'שחור', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Renault', model: 'Megane', trim: 'Intense', year: 2018, price: 58000, km: 115000, categories: ['diesel'], color: 'כסף', gearbox: 'אוטומט', engineType: 'דיזל' },
  { manufacturer: 'Renault', model: 'Captur', trim: 'Iconic', year: 2024, price: 142000, km: 9000, categories: ['petrol'], color: 'כתום', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'BMW', model: 'X1', trim: 'sDrive18i', year: 2021, price: 210000, km: 42000, categories: ['petrol'], color: 'שחור', gearbox: 'אוטומט', engineType: 'בנזין', vehicleType: 'SUV' },
  { manufacturer: 'Mercedes', model: 'A-Class', trim: 'A200', year: 2020, price: 185000, km: 58000, categories: ['petrol'], color: 'לבן', gearbox: 'אוטומט', engineType: 'בנזין' },
  { manufacturer: 'Tesla', model: 'Model 3', trim: 'RWD', year: 2023, price: 235000, km: 20000, categories: ['electric'], color: 'אדום', gearbox: 'אוטומט', engineType: 'חשמלי' },
];

const replace = process.argv.includes('--replace');

if (replace) {
  const existing = getAllVehicles();
  let removed = 0;
  for (const v of existing) {
    if (SYSTEM_IDS.includes(String(v.systemId)) || String(v.notes || '').includes(DEMO_TAG)) {
      deleteVehicle(v.id);
      removed += 1;
    }
  }
  console.log(`הוסרו ${removed} רכבי דמו קודמים`);
}

const already = new Set(
  getAllVehicles()
    .filter((v) => SYSTEM_IDS.includes(String(v.systemId)))
    .map((v) => String(v.systemId))
);

if (already.size >= 30 && !replace) {
  console.log(`כבר קיימים ${already.size} רכבי דמו (90001–90030). הרץ עם --replace לרענון.`);
  console.log(`קובץ: ${VEHICLES_FILE}`);
  process.exit(0);
}

let created = 0;
for (let i = 0; i < SPECS.length; i++) {
  const systemId = SYSTEM_IDS[i];
  if (already.has(systemId) && !replace) continue;
  const s = SPECS[i];
  const purchasePrice = Math.round(s.price * 0.78);
  createVehicle({
    systemId,
    plate: `12-${300 + i}-${40 + (i % 10)}`,
    manufacturer: s.manufacturer,
    model: s.model,
    trim: s.trim,
    year: s.year,
    price: s.price,
    askingPrice: s.price,
    km: s.km,
    color: s.color,
    gearbox: s.gearbox,
    engineType: s.engineType,
    engineVolume: s.categories.includes('electric') ? '' : '1600',
    categories: s.categories,
    vehicleType: s.vehicleType || 'פרטי',
    condition: 'משומש',
    location: i % 2 === 0 ? 'תל אביב' : 'ראשון לציון',
    hand: String(1 + (i % 3)),
    doors: 5,
    status: 'במלאי',
    warranty: i % 3 === 0 ? '12 חודשים' : '',
    mainDescription: `${s.manufacturer} ${s.model} ${s.year} — דמו לבדיקת AI`,
    // שדות רגישים — חייבים להיעלם ב-AI DTO
    purchasePrice,
    purchasePriceWithExpenses: purchasePrice + 3500,
    expenses: [{ type: 'טיפול', amount: 3500, note: 'פנימי' }],
    notes: `${DEMO_TAG} הערה פנימית לסוכן`,
    managerNotes: 'עלות רכישה חסויה — לא לחשוף ללקוח',
    actualSalePrice: null,
    listPriceEstimate: s.price + 5000,
  });
  created += 1;
}

const total = getAllVehicles().length;
const demoCount = getAllVehicles().filter((v) => SYSTEM_IDS.includes(String(v.systemId))).length;
console.log(`נוצרו ${created} רכבים. סה״כ במלאי: ${total}. רכבי דמו: ${demoCount}`);
console.log(`קובץ: ${VEHICLES_FILE}`);
