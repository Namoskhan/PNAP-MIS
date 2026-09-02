import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                height: 100dvh;
                margin: 0;
                padding: 0;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
              }
              * {
                box-sizing: border-box;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
