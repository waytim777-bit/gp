import type React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div className={cn('rounded-xl bg-default-50 px-6 py-10 text-center', className)}>
      {icon ? <div className="mb-4 flex justify-center text-default-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-secondary">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-secondary">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
};
