import kabLogo from '../../assets/logo_kota_yogyakarta.png';
import { createLbsPage } from '../shared/lbs-page.js';

createLbsPage({
  slug: 'yogyakarta',
  kabName: 'Kota Yogyakarta',
  kabLabel: 'Kota Yogyakarta',
  logo: kabLogo,
  logoAlt: 'Logo Kota Yogyakarta',
  center: [110.3761, -7.8079], // sekitar Kota Yogyakarta
  zoom: 12
});
