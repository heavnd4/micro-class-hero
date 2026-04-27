App({
  onLaunch() {
    console.log('小程序启动');
  },
  globalData: {
    // 后端服务器地址，本地内测时请改为你电脑的局域网 IP
    serverUrl: 'http://127.0.0.1:5000'
  }
})