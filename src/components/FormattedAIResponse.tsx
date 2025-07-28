export function FormattedAIResponse({ response }: { response: string }) {
  // Split response into sections based on numbered lists and bullet points
  const sections = response.split(/(?=\d+\.\s+\*\*)/);
  
  return (
    <div style={{ lineHeight: '1.6' }}>
      {sections.map((section, index) => {
        const trimmedSection = section.trim();
        if (!trimmedSection) return null;
        
        // Check if this section starts with a numbered item
        const numberedMatch = trimmedSection.match(/^(\d+)\.\s+\*\*(.*?)\*\*:\s*(.*)/s);
        
        if (numberedMatch) {
          const [, number, title, content] = numberedMatch;
          return (
            <div key={index} style={{ marginBottom: '16px' }}>
              <div style={{ 
                fontWeight: 'bold', 
                color: '#2c3e50', 
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                {number}. {title}:
              </div>
              <div style={{ 
                color: '#34495e', 
                fontSize: '13px',
                paddingLeft: '16px',
                borderLeft: '2px solid #ecf0f1',
                marginLeft: '8px'
              }}>
                {content.trim()}
              </div>
            </div>
          );
        }
        
        // Check for bullet points
        const bulletMatch = trimmedSection.match(/^[-*]\s+(.*)/);
        if (bulletMatch) {
          return (
            <div key={index} style={{ marginBottom: '8px' }}>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li style={{ 
                  color: '#34495e', 
                  fontSize: '13px',
                  marginBottom: '4px'
                }}>
                  {bulletMatch[1]}
                </li>
              </ul>
            </div>
          );
        }
        
        // Check for bold headers (like "Related Equipment Statistics:")
        const headerMatch = trimmedSection.match(/^\*\*(.*?)\*\*:\s*(.*)/s);
        if (headerMatch) {
          const [, header, content] = headerMatch;
          return (
            <div key={index} style={{ marginBottom: '12px' }}>
              <div style={{ 
                fontWeight: 'bold', 
                color: '#2c3e50', 
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                {header}:
              </div>
              <div style={{ 
                color: '#34495e', 
                fontSize: '13px',
                paddingLeft: '16px'
              }}>
                {content.trim()}
              </div>
            </div>
          );
        }
        
        // Regular text
        return (
          <div key={index} style={{ 
            color: '#34495e', 
            fontSize: '13px',
            marginBottom: '8px'
          }}>
            {trimmedSection}
          </div>
        );
      })}
    </div>
  );
}