// vite.config.js
import { defineConfig, loadEnv } from "file:///D:/Project/PNAP-MIS/pnap-mis/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Project/PNAP-MIS/pnap-mis/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = parseInt(env.VITE_PORT || env.PORT || "5173", 10);
  const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || "http://localhost:5000";
  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        "/api": backendUrl,
        "/uploads": backendUrl
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxQcm9qZWN0XFxcXFBOQVAtTUlTXFxcXHBuYXAtbWlzXFxcXHdlYlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcUHJvamVjdFxcXFxQTkFQLU1JU1xcXFxwbmFwLW1pc1xcXFx3ZWJcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L1Byb2plY3QvUE5BUC1NSVMvcG5hcC1taXMvd2ViL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XHJcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpLCAnJyk7XHJcbiAgY29uc3QgcG9ydCA9IHBhcnNlSW50KGVudi5WSVRFX1BPUlQgfHwgZW52LlBPUlQgfHwgJzUxNzMnLCAxMCk7XHJcbiAgY29uc3QgYmFja2VuZFVybCA9IGVudi5WSVRFX0JBQ0tFTkRfVVJMIHx8IGVudi5CQUNLRU5EX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDo1MDAwJztcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHBsdWdpbnM6IFtyZWFjdCgpXSxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBwb3J0LFxyXG4gICAgICBwcm94eToge1xyXG4gICAgICAgICcvYXBpJzogYmFja2VuZFVybCxcclxuICAgICAgICAnL3VwbG9hZHMnOiBiYWNrZW5kVXJsLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9O1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0UixTQUFTLGNBQWMsZUFBZTtBQUNsVSxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDeEMsUUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksR0FBRyxFQUFFO0FBQzNDLFFBQU0sT0FBTyxTQUFTLElBQUksYUFBYSxJQUFJLFFBQVEsUUFBUSxFQUFFO0FBQzdELFFBQU0sYUFBYSxJQUFJLG9CQUFvQixJQUFJLGVBQWU7QUFFOUQsU0FBTztBQUFBLElBQ0wsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLElBQ2pCLFFBQVE7QUFBQSxNQUNOO0FBQUEsTUFDQSxPQUFPO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsTUFDZDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
