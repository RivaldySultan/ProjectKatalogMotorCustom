const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=85',
];

export const categoryOptions = [
  { id: 'all', number: '00', label: 'All Builds' },
  { id: 'cafe-racer', number: '01', label: 'Café Racer' },
  { id: 'chopper', number: '02', label: 'Chopper' },
  { id: 'british-style', number: '03', label: 'British Style' },
];

export { FALLBACK_IMAGES };

const BUILD_PRESENTATION = {
  prod_1: {
    code: 'RK-01',
    name: 'The Silverline',
    basis: 'Suzuki Thunder',
    catalogImage: '/images/catalog/rk-01-the-silverline.jpg',
  },
  prod_2: {
    code: 'RK-02',
    name: 'The Longway',
    basis: 'Yamaha Scorpio',
    catalogImage: '/images/catalog/rk-02-the-longway.jpg',
  },
  prod_3: {
    code: 'RK-03',
    name: 'The Gentleman',
    basis: 'Honda Tiger',
    catalogImage: '/images/catalog/rk-03-the-gentleman.jpg',
  },
};

const SILVERLINE_EXAMPLE_SPECS = {
  engine: '125 cc · 1 cylinder · 4-stroke',
  transmission: 'Manual · 5-speed',
  cockpit: 'Clip-on handlebars · compact instrument panel',
  finishing: 'Single seat · brushed silver',
};

function getBuildPresentation(product) {
  const knownBuild = BUILD_PRESENTATION[String(product.id)];
  if (knownBuild) return knownBuild;

  const normalizedName = String(product.name || '').trim().toLowerCase();
  return Object.values(BUILD_PRESENTATION).find(
    (build) => build.basis.toLowerCase().endsWith(normalizedName),
  ) || {};
}

export function getProductBuildCode(product) {
  return product.buildCode || product.code || getBuildPresentation(product).code || '';
}

export function getProductBuildName(product) {
  return product.buildName || product.seriesName || getBuildPresentation(product).name || '';
}

export function getProductBasis(product) {
  return product.basis
    || product.base
    || product.motorcycle
    || getBuildPresentation(product).basis
    || '';
}

export function getProductSpecifications(product) {
  const isSilverlineExample = String(product.id) === 'prod_1';
  const confirmedLater = 'To be confirmed during consultation';
  const fixedSpecifications = String(product.fixedSpecifications || '')
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf(':');
      return separator > 0
        ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        : null;
    })
    .filter(Boolean);

  return [
    ['Donor motorcycle', getProductBasis(product) || confirmedLater],
    ['Design direction', product.categoryName || confirmedLater],
    ['Engine', product.engine || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.engine : confirmedLater)],
    ['Transmission', product.transmission || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.transmission : confirmedLater)],
    ['Cockpit', product.cockpit || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.cockpit : confirmedLater)],
    ['Seat & finish', product.finishing || (isSilverlineExample ? SILVERLINE_EXAMPLE_SPECS.finishing : confirmedLater)],
    ...fixedSpecifications,
  ];
}

export function isProductActive(product) {
  return String(product?.stockStatus || '').trim().toLowerCase() === 'tersedia';
}

export function getActiveProducts(products) {
  return (Array.isArray(products) ? products : []).filter(isProductActive);
}

export function getProductDisplayName(product) {
  return getProductBuildName(product) || product?.name || '';
}

export function getCategoryKey(product) {
  const category = `${product.categoryName || ''} ${product.categoryId || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (category.includes('cafe') || category.includes('cat_1')) return 'cafe-racer';
  if (category.includes('chopper') || category.includes('cat_2')) return 'chopper';
  if (category.includes('british') || category.includes('cat_3')) return 'british-style';
  return '';
}

export function getProductImage(product, index = 0) {
  const image = product.image || product.img_url;
  if (!image) return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
  if (/^https?:\/\//i.test(image) || image.startsWith('/')) return image;
  return `/uploads/${encodeURIComponent(image)}`;
}

export function getCatalogProductImage(product, index = 0) {
  const uploadedImage = product.image || product.img_url;
  if (
    typeof uploadedImage === 'string'
    && (uploadedImage.startsWith('/uploads/products/') || uploadedImage.startsWith('/images/catalog/'))
  ) {
    return getProductImage(product, index);
  }

  const catalogImage = getBuildPresentation(product).catalogImage;
  if (catalogImage) return catalogImage;
  if (!product.image && !product.img_url) return '';
  return getProductImage(product, index);
}

export function getFallbackImage(index = 0) {
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

export function formatRupiah(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 'Contact us';

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(numericAmount);
}

export function sortProducts(products, sort) {
  const list = [...products];

  if (sort === 'featured') {
    return list;
  }

  if (sort === 'price-asc') {
    return list.sort((a, b) => Number(a.price) - Number(b.price));
  }

  if (sort === 'price-desc') {
    return list.sort((a, b) => Number(b.price) - Number(a.price));
  }

  return list.sort((a, b) => {
    const dateA = Date.parse(a.createdAt) || 0;
    const dateB = Date.parse(b.createdAt) || 0;
    if (dateB !== dateA) return dateB - dateA;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function getProductIndex(products, id) {
  return products.findIndex((product) => String(product.id) === String(id));
}
