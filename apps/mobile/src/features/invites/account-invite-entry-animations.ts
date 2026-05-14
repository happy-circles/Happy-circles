import { LayoutAnimation } from 'react-native';

export const emailAccordionOpenLayoutAnimation = {
  create: {
    property: LayoutAnimation.Properties.opacity,
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  duration: 260,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
};

export const emailAccordionCloseLayoutAnimation = {
  delete: {
    property: LayoutAnimation.Properties.opacity,
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  duration: 210,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
};
