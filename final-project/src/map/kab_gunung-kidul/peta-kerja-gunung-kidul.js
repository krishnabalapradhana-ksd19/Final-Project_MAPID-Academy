import './peta-kerja-gunung-kidul.css';
import kabLogo from '../../assets/logo_kabupaten_gunung_kidul.png';
import { createLbsPage } from '../shared/lbs-page.js';

createLbsPage({
  slug: 'gunungkidul',
  kabName: 'Gunungkidul',
  kabLabel: 'Kabupaten Gunungkidul',
  logo: kabLogo,
  logoAlt: 'Logo Kabupaten Gunungkidul',
  center: [110.5848, -7.9931], // sekitar Kabupaten Gunungkidul
  zoom: 10
});
