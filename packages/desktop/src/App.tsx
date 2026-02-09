import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import SupportPage from '@/pages/SupportPage';

export default function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/support" element={<SupportPage />} />
      </Routes>
      <Toaster />
    </ThemeProvider>
  );
}
