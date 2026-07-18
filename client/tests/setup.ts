import '@testing-library/jest-dom/vitest';

// Mock scrollIntoView vì jsdom không hỗ trợ
Element.prototype.scrollIntoView = () => {};
