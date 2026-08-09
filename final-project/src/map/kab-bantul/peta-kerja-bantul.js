import './peta-kerja-bantul.css';
import kabLogo from '../../assets/logo_kabupaten_bantul.png';
import { createLbsPage } from '../shared/lbs-page.js';

createLbsPage({
  slug: 'bantul',
  kabName: 'Bantul',
  kabLabel: 'Kabupaten Bantul',
  logo: kabLogo,
  logoAlt: 'Logo Kabupaten Bantul',
  center: [110.3669, -7.8984], // sekitar Kabupaten Bantul
  zoom: 11
});
