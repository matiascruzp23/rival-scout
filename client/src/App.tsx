import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import RivalsList from './pages/RivalsList';
import RivalLayout from './pages/RivalLayout';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import MatchesPage from './pages/MatchesPage';
import MatchDetailPage from './pages/MatchDetailPage';
import LineupsPage from './pages/LineupsPage';
import SubstitutionsPage from './pages/SubstitutionsPage';
import CsvAnalysisPage from './pages/CsvAnalysisPage';
import InformePage from './pages/InformePage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/" element={<RivalsList />} />
          <Route path="/rivales/:rivalId" element={<RivalLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="jugadores" element={<PlayersPage />} />
            <Route path="partidos" element={<MatchesPage />} />
            <Route path="partidos/:matchId" element={<MatchDetailPage />} />
            <Route path="xi-rotaciones" element={<LineupsPage />} />
            <Route path="sustituciones" element={<SubstitutionsPage />} />
            <Route path="analisis-csv" element={<CsvAnalysisPage />} />
            <Route path="informe" element={<InformePage />} />
          </Route>
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}
