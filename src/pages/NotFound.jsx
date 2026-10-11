import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../ui';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This address doesn’t match any screen you have access to."
        action={<Link className="btn" to="/home">Go to home</Link>}
      />
    </div>
  );
}
