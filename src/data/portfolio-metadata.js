// Portfolio metadata for filtering images by project and service category
export const projects = [
  {
    id: 'holland-park',
    name: 'Holland Park',
    description: 'Apartment redesign and renovation in Holland Park',
    featuredImage: '/images/portfolio/projects/holland-park/10.-Holland-Park-Apartment-Redesign.-Decorbuddi-48.webp',
    categories: ['renovations']
  },
  {
    id: 'raymond-rd',
    name: 'Raymond Road',
    description: 'Complete home renovation and modernization',
    featuredImage: '/images/portfolio/projects/raymond-rd/62-Raymond-Rd-34.webp',
    categories: ['renovations']
  },
  {
    id: 'seagrave-road',
    name: 'Seagrave Road',
    description: 'Luxury renovation project with premium finishes',
    featuredImage: '/images/portfolio/projects/seagrave-road/82936_167-Seagrave-Road28_26 (10)_low.webp',
    categories: ['renovations']
  },
  {
    id: 'charlotte-street',
    name: 'Charlotte Street',
    description: 'Apartment renovation with modern design elements',
    featuredImage: '/images/portfolio/projects/charlotte-street/Charlotte street 1.webp',
    categories: ['renovations']
  },
  {
    id: 'chesterton-road',
    name: 'Chesterton Road',
    description: 'Complete home transformation and redesign',
    featuredImage: '/images/portfolio/projects/chesterton-road/Chesterton Road web-01.webp',
    categories: ['renovations']
  },
  {
    id: 'wimbledon',
    name: 'Wimbledon',
    description: 'Upscale home renovation with luxury features',
    featuredImage: '/images/portfolio/projects/wimbledon/Wimbledon_Living_Room_1.webp',
    categories: ['renovations']
  }
];

// Service categories
export const serviceCategories = [
  {
    id: 'all',
    name: 'All Projects',
    description: 'View all our projects'
  },
  {
    id: 'renovations',
    name: 'Full Renovations',
    description: 'Complete home renovations and transformations'
  },
  {
    id: 'kitchens',
    name: 'Kitchen Design',
    description: 'Modern kitchen designs and renovations'
  },
  {
    id: 'bathrooms',
    name: 'Bathroom Design',
    description: 'Luxury bathroom renovations'
  },
  {
    id: 'bedrooms',
    name: 'Bedroom Design',
    description: 'Elegant bedroom designs and layouts'
  },
  {
    id: 'living-spaces',
    name: 'Living Spaces',
    description: 'Living room and common area designs'
  },
  {
    id: 'extensions',
    name: 'Extensions',
    description: 'Home extension projects'
  },
  {
    id: 'general',
    name: 'General Projects',
    description: 'Miscellaneous and unique design elements'
  }
];

// Image metadata with tags
export const imageMetadata = [
  // Holland Park images - original order preserved
  {
    src: '/images/portfolio/projects/holland-park/2.-Holland-Park-Apartment-Redesign.-.webp',
    alt: 'Holland Park Hallway',
    project: 'holland-park',
    categories: ['renovations', 'general'],
    title: 'Stylish Hallway',
    description: 'Elegant hallway with custom millwork and detailing'
  },
  {
    src: '/images/portfolio/projects/holland-park/16.-Holland-Park-Apartment-Redesign.-Decorbuddi-50.webp',
    alt: 'Holland Park Bathroom',
    project: 'holland-park',
    categories: ['renovations', 'bathrooms'],
    title: 'Luxury Bathroom',
    description: 'Modern bathroom with marble and textured tile finishes'
  },
  {
    src: '/images/portfolio/projects/holland-park/10.-Holland-Park-Apartment-Redesign.-Decorbuddi-48.webp',
    alt: 'Holland Park Master Bedroom',
    project: 'holland-park',
    categories: ['renovations', 'bedrooms'],
    title: 'Elegant Master Bedroom',
    description: 'Spacious bedroom with custom storage and natural light'
  },
  {
    src: '/images/portfolio/projects/holland-park/14.-Holland-Park-Apartment-Redesign.-Decorbuddi-57.webp',
    alt: 'Holland Park Utility Room',
    project: 'holland-park',
    categories: ['renovations', 'kitchens'],
    title: 'Utility Room',
    description: 'Premium utility area with custom cabinetry'
  },
  {
    src: '/images/portfolio/projects/holland-park/8.-Holland-Park-Apartment-Redesign.-Decorbuddi-36.webp',
    alt: 'Holland Park Interior Detail',
    project: 'holland-park',
    categories: ['renovations', 'general'],
    title: 'Interior Detail',
    description: 'Elegant interior with built-in storage solutions'
  },

  // Raymond Road images
  {
    src: '/images/portfolio/projects/raymond-rd/62-Raymond-Rd-34.webp',
    alt: 'Raymond Road Bedroom',
    project: 'raymond-rd',
    categories: ['renovations', 'bedrooms'],
    title: 'Modern Bedroom',
    description: 'Contemporary bedroom with clean lines and natural light'
  },
  {
    src: '/images/portfolio/projects/raymond-rd/62-Raymond-Rd-75.webp',
    alt: 'Raymond Road Bathroom',
    project: 'raymond-rd',
    categories: ['renovations', 'bathrooms'],
    title: 'Stylish Bathroom',
    description: 'Contemporary bathroom with elegant black fixtures'
  },

  // Seagrave Road images
  {
    src: '/images/portfolio/projects/seagrave-road/82936_167-Seagrave-Road28_26 (10)_low.webp',
    alt: 'Seagrave Road Kitchen',
    project: 'seagrave-road',
    categories: ['renovations', 'kitchens'],
    title: 'Designer Kitchen',
    description: 'Modern kitchen with green cabinetry and premium appliances'
  },
  {
    src: '/images/portfolio/projects/seagrave-road/82936_167-Seagrave-Road28_26 (20)_low.webp',
    alt: 'Seagrave Road Bedroom',
    project: 'seagrave-road',
    categories: ['renovations', 'bedrooms'],
    title: 'Elegant Bedroom',
    description: 'Luxurious bedroom with patterned wallpaper and custom headboard'
  },
  {
    src: '/images/portfolio/projects/seagrave-road/82936_167-Seagrave-Road28_26 (12)_low.webp',
    alt: 'Seagrave Road Living Dining Room',
    project: 'seagrave-road',
    categories: ['renovations', 'living-spaces'],
    title: 'Living and Dining Space',
    description: 'Open plan living and dining area with contemporary furniture'
  },
  {
    src: '/images/portfolio/projects/seagrave-road/82936_167-Seagrave-Road28_26 (11)_low.webp',
    alt: 'Seagrave Road Kitchen Alternative View',
    project: 'seagrave-road',
    categories: ['renovations', 'kitchens'],
    title: 'Kitchen - Another Angle',
    description: 'Additional view of the designer kitchen showing window and storage'
  },

  // Charlotte Street images
  {
    src: '/images/portfolio/projects/charlotte-street/Charlotte street 1.webp',
    alt: 'Charlotte Street His & Hers Bathroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bathrooms'],
    title: 'His & Hers Master Bathroom',
    description: 'Elegant master bathroom with his & hers basins and marble finishes'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Guest_Bathroom_Charlotte_Street_Apartment_13.webp',
    alt: 'Charlotte Street Bathroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bathrooms'],
    title: 'Guest Bathroom',
    description: 'Contemporary bathroom with custom tiling'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Guest_Bathroom_Charlotte_Street_Apartment_2.webp',
    alt: 'Charlotte Street Second Bathroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bathrooms'],
    title: 'Modern Guest Bathroom',
    description: 'Elegant bathroom with modern fixtures'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Master_En_suite_Charlotte_Street_Apartment_5.webp',
    alt: 'Charlotte Street Master Bathroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bathrooms'],
    title: 'Master En-Suite',
    description: 'Luxury en-suite bathroom with walk-in shower'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Master_En_suite_Charlotte_Street_Apartment_6.webp',
    alt: 'Charlotte Street Master Bathroom Detail',
    project: 'charlotte-street',
    categories: ['renovations', 'bathrooms'],
    title: 'Master Bathroom Details',
    description: 'Premium fixtures and finishes in master bathroom'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Guest_Bedroom_Charlotte_Street_Apartment_11.webp',
    alt: 'Charlotte Street Guest Bedroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bedrooms'],
    title: 'Guest Bedroom',
    description: 'Comfortable guest bedroom with elegant design'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Master_Bedroom_Charlotte_Street_Apartment_4.webp',
    alt: 'Charlotte Street Master Bedroom',
    project: 'charlotte-street',
    categories: ['renovations', 'bedrooms'],
    title: 'Master Bedroom',
    description: 'Spacious master bedroom with premium fixtures'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Living_Charlotte_Street_Apartment.webp',
    alt: 'Charlotte Street Living Area',
    project: 'charlotte-street',
    categories: ['renovations', 'living-spaces'],
    title: 'Open Plan Living',
    description: 'Bright living space with contemporary design'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Living_Charlotte_Street_Apartment_9.webp',
    alt: 'Charlotte Street Second Living Area',
    project: 'charlotte-street',
    categories: ['renovations', 'living-spaces'],
    title: 'Modern Living Space',
    description: 'Contemporary living area with custom design'
  },
  {
    src: '/images/portfolio/projects/charlotte-street/Decorbuddi_Roof_Terrace_Charlotte_Street_Apartment_14.webp',
    alt: 'Charlotte Street Roof Terrace',
    project: 'charlotte-street',
    categories: ['renovations', 'extensions', 'general'],
    title: 'Roof Terrace',
    description: 'Elegant outdoor space with city views'
  },

  // Chesterton Road images
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road details web-02.webp',
    alt: 'Chesterton Road Feature',
    project: 'chesterton-road',
    categories: ['renovations', 'general'],
    title: 'Architectural Feature',
    description: 'Unique design elements and details'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road web-02.webp',
    alt: 'Chesterton Road Bedroom',
    project: 'chesterton-road',
    categories: ['renovations', 'bedrooms'],
    title: 'Bedroom',
    description: 'Stylish bedroom with contemporary design elements'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road details web-03.webp',
    alt: 'Chesterton Road Interior',
    project: 'chesterton-road',
    categories: ['renovations', 'general'],
    title: 'Custom Interior Elements',
    description: 'Bespoke design details throughout the home'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road details web-01.webp',
    alt: 'Chesterton Road Detail',
    project: 'chesterton-road',
    categories: ['renovations', 'general'],
    title: 'Interior Detail',
    description: 'Custom millwork and finishes'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road web-03.webp',
    alt: 'Chesterton Road Master Bedroom',
    project: 'chesterton-road',
    categories: ['renovations', 'bedrooms'],
    title: 'Master Bedroom',
    description: 'Elegant master bedroom with premium finishes'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road web-04.webp',
    alt: 'Chesterton Road Master Bedroom',
    project: 'chesterton-road',
    categories: ['renovations', 'bedrooms'],
    title: 'Master Bedroom',
    description: 'Elegant bedroom with custom design'
  },

  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road web-18.webp',
    alt: 'Chesterton Road Living Room',
    project: 'chesterton-road',
    categories: ['renovations', 'living-spaces'],
    title: 'Living Room',
    description: 'Contemporary living space with modern design features'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road details web-19.webp',
    alt: 'Chesterton Road Living Room Detail',
    project: 'chesterton-road',
    categories: ['renovations', 'living-spaces', 'general'],
    title: 'Living Room Cabinetry',
    description: 'Custom built-in cabinetry and shelving in living area'
  },
  {
    src: '/images/portfolio/projects/chesterton-road/Chesterton Road details web-23.webp',
    alt: 'Chesterton Road Living Room Feature',
    project: 'chesterton-road',
    categories: ['renovations', 'living-spaces'],
    title: 'Living Room Detail',
    description: 'Architectural details and custom finishes in living space'
  },

  // Wimbledon images
  {
    src: '/images/portfolio/projects/wimbledon/Wimbledon_Living_Room_1.webp',
    alt: 'Wimbledon Living Room',
    project: 'wimbledon',
    categories: ['renovations', 'living-spaces'],
    title: 'Spacious Living Room',
    description: 'Contemporary living space with premium finishes'
  },
  {
    src: '/images/portfolio/projects/wimbledon/Wimbledon_Master_Bedroom_.webp',
    alt: 'Wimbledon Master Bedroom',
    project: 'wimbledon',
    categories: ['renovations', 'bedrooms'],
    title: 'Master Bedroom',
    description: 'Elegant bedroom design with bespoke storage'
  },
  {
    src: '/images/portfolio/projects/wimbledon/Wimbledon_Guest_Bedroom_2.webp',
    alt: 'Wimbledon Guest Bedroom',
    project: 'wimbledon',
    categories: ['renovations', 'bedrooms'],
    title: 'Guest Bedroom',
    description: 'Comfortable guest bedroom with modern design'
  }
];

// Helper function to filter images by project and category
export function filterImages(projectId = null, categoryId = null) {
  return imageMetadata.filter(image => {
    // Filter by project if specified
    const projectMatch = !projectId || projectId === 'all' || image.project === projectId;
    
    // Filter by category if specified
    const categoryMatch = !categoryId || categoryId === 'all' || image.categories.includes(categoryId);
    
    // Image must match both filters to be included
    return projectMatch && categoryMatch;
  });
}

// Helper function to get all images for a specific project
export function getProjectImages(projectId) {
  return imageMetadata.filter(image => image.project === projectId);
}

// Helper function to get all images for a specific category
export function getCategoryImages(categoryId) {
  return imageMetadata.filter(image => image.categories.includes(categoryId));
}
