import { IconAward, IconClose } from './icons';

interface CreditsProps {
  onClose: () => void;
}

// Map creators whose battle maps make up the built-in collection. No links
// are included since none have been confirmed with the artists yet — add
// them here once you have a URL each creator is happy to be credited with.
const MAP_CREATORS = ['Dungeon Mapster', '2-Minute Tabletop (2MTT)', 'Gogots', 'Crosshead'];

export function Credits({ onClose }: CreditsProps) {
  return (
    <div className="collection-overlay" onClick={onClose}>
      <div className="credits-panel" onClick={(e) => e.stopPropagation()}>
        <header className="collection-header">
          <div>
            <h2><IconAward size={20} /> Map Credits</h2>
            <p className="collection-sub">The art behind the built-in map collection</p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </header>

        <div className="credits-body">
          <p>
            The battle maps in Fog Atlas's built-in collection are the work of several talented
            cartographers, generously shared and curated for this app by{' '}
            <strong>u/uchideshi34</strong> on Reddit.
          </p>

          <ul className="credits-list">
            {MAP_CREATORS.map((name) => (
              <li key={name} className="credits-item">
                <IconAward size={15} />
                {name}
              </li>
            ))}
          </ul>

          <p className="credits-footnote">
            If you're one of these artists (or represent them) and would like this credit
            changed, expanded, or linked to your page, please reach out — happy to update it.
          </p>
        </div>
      </div>
    </div>
  );
}
