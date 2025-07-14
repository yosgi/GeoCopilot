import React from 'react';

// React component for easy integration
export interface GeoCopilotProviderProps {
  children: React.ReactNode;
  apiKey?: string;
}

export const GeoCopilotProvider: React.FC<GeoCopilotProviderProps> = ({ 
  children, 
  apiKey 
}) => {
  // Set API key if provided
  React.useEffect(() => {
    if (apiKey) {
      // You can set the API key here if needed
      console.log('GeoCopilot API key provided');
    }
  }, [apiKey]);

  return <>{children}</>;
}; 