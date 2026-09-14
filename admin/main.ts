import { createApp } from 'vue';
import App from './App.vue';
// 后台自己的 Tailwind 入口：复用前台 app.css 的令牌，并把 admin/** 纳入源码扫描
// （前台那份 app.css 只声明了 web/**，后台类名此前根本没被生成）
import './styles/admin.css';

createApp(App).mount('#app');
