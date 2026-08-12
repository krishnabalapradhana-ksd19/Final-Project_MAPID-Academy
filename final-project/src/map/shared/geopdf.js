import { PDFArray, PDFDict, PDFName, PDFNumber, PDFString } from 'pdf-lib';

const MM_PER_INCH = 25.4;
const PDF_UNITS_PER_INCH = 72;

export const mmToPdfUnits = (mm) => (mm / MM_PER_INCH) * PDF_UNITS_PER_INCH;

const WEB_MERCATOR_EPSG = 3857;
const WEB_MERCATOR_WKT =
  'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",' +
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
  'PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],' +
  'PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],' +
  'PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';

export function attachGeoreference(pdfDoc, page, mapFaceMm, pageHeightMm, bounds) {
  const { west, south, east, north } = bounds;

  const left = mmToPdfUnits(mapFaceMm.x);
  const width = mmToPdfUnits(mapFaceMm.w);
  const height = mmToPdfUnits(mapFaceMm.h);
  const bottom = mmToPdfUnits(pageHeightMm - mapFaceMm.y - mapFaceMm.h);

  const context = pdfDoc.context;

  const dict = (entries) => {
    const target = PDFDict.withContext(context);
    Object.entries(entries).forEach(([key, value]) => target.set(PDFName.of(key), value));
    return target;
  };
  const numbers = (values) => {
    const array = PDFArray.withContext(context);
    values.forEach((value) => array.push(PDFNumber.of(value)));
    return array;
  };

  const gcs = dict({
    Type: PDFName.of('PROJCS'),
    EPSG: PDFNumber.of(WEB_MERCATOR_EPSG),
    WKT: PDFString.of(WEB_MERCATOR_WKT)
  });

  const corners = [0, 1, 0, 0, 1, 0, 1, 1];
  const geoCorners = [north, west, south, west, south, east, north, east];

  const measure = dict({
    Type: PDFName.of('Measure'),
    Subtype: PDFName.of('GEO'),
    Bounds: numbers(corners),
    GCS: context.register(gcs),
    GPTS: numbers(geoCorners),
    LPTS: numbers(corners)
  });

  const viewport = dict({
    Type: PDFName.of('Viewport'),
    Name: PDFString.of('Muka Peta'),
    BBox: numbers([left, bottom, left + width, bottom + height]),
    Measure: context.register(measure)
  });

  const viewports = PDFArray.withContext(context);
  viewports.push(context.register(viewport));
  page.node.set(PDFName.of('VP'), viewports);
}
