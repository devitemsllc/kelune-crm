import React from 'react';
import NoPermission from './NoPermission';
import { canAny, type Capability } from '../../utils/capabilities';

interface RequireCapabilityProps {
  /** The capability, or any one of several, the route needs. */
  capability: Capability | Capability[];
  children: React.ReactNode;
}

/** Route guard: renders the page, or a "no permission" state in its place. */
const RequireCapability = ({
  capability,
  children,
}: RequireCapabilityProps) => {
  const required = Array.isArray(capability) ? capability : [capability];

  return canAny(required) ? <>{children}</> : <NoPermission />;
};

export default RequireCapability;
