import { COMPANIES, type CompanyId } from '../game/content/catalog';

// Etiqueta con el nombre y el color de la empresa.
function CompanyChip({ company }: { company: CompanyId }) {
  const { name, color } = COMPANIES[company];

  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-sm font-extrabold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  );
}

export default CompanyChip;
