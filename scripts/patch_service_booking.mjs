import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const filePath = path.join(backendRoot, 'src', 'modules', 'service_booking', 'service_booking.service.js');

let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  'service_address: bookingData.service_address,',
  'service_address: effectiveServiceAddress,'
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Fixed service_address to effectiveServiceAddress in ServiceBooking.create');
