import type React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface EyeToggleIconProps {
  /** true = password visible, show eye-slash (hide). false = password hidden, show eye (show) */
  visible: boolean;
  className?: string;
}

export const EyeToggleIcon: React.FC<EyeToggleIconProps> = ({ visible, className = 'h-5 w-5' }) => {
  const Icon = visible ? EyeOff : Eye;
  return <Icon className={className} aria-hidden={true} strokeWidth={1.75} />;
};
