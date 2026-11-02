import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function ChatMarkdown({ content }: { content: string }): React.ReactElement {
  return <div className="chat-markdown" data-testid="chat-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml disallowedElements={['img']}>
      {content}
    </ReactMarkdown>
  </div>;
}
