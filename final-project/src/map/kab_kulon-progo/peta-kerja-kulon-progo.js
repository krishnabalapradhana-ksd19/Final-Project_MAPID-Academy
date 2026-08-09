import './peta-kerja-kulon-progo.css';
import kabLogo from '../../assets/logo_kabupaten_kulon_progo.png';
import { createLbsPage } from '../shared/lbs-page.js';

createLbsPage({
  slug: 'kulon-progo',
  kabName: 'Kulon Progo',
  kabLabel: 'Kabupaten Kulon Progo',
  logo: kabLogo,
  logoAlt: 'Logo Kabupaten Kulon Progo',
  center: [110.1476, -7.8144], // sekitar Kabupaten Kulon Progo
  zoom: 11
});
