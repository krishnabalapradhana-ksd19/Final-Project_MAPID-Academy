import './peta-kerja-sleman.css';
import slemanLogo from '../../assets/logo_kabupaten_sleman.png';
import { createLbsPage } from '../shared/lbs-page.js';

createLbsPage({
  slug: 'sleman',
  kabName: 'Sleman',
  kabLabel: 'Kabupaten Sleman',
  logo: slemanLogo,
  logoAlt: 'Logo Kabupaten Sleman',
  center: [110.375, -7.68], // sekitar Kabupaten Sleman
  zoom: 11
});
