App({
  onLaunch() {
    console.log('小程序启动');
    // 懒初始化：首次调用 api 时才初始化 cloud（避免异步问题）
    this.cloud = null;
  },
  globalData: {
    cloudEnv: 'study-d2g0ezztf8f8798f3',
    cloudService: 'weike-backend',
    // 开发模式：true=本地后端（wx.request），false=云托管（callContainer）
    localMode: false,
    localServerUrl: 'http://127.0.0.1:5000',
    // 调试模式：true 时答题区显示跳题按钮，选择题点击直接跳过不看对错
    debugMode: true
  },

  /**
   * 统一请求方法
   * localMode=true: 本地 wx.request
   * localMode=false: wx.cloud.callContainer（内网，不需要域名）
   */
  async api(path, options = {}) {
    const { method = 'GET', data, header = {} } = options;

    // 本地开发模式
    if (this.globalData.localMode) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: this.globalData.localServerUrl + path,
          method,
          data,
          header,
          success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
          fail: reject
        });
      });
    }

    // 云托管模式：懒初始化 cloud（带重试）
    return this._callWithRetry(path, { method, data, header }, 0);
  },

  async _callWithRetry(path, options, retryCount) {
    try {
      // 懒初始化：首次调用时才初始化 cloud
      if (this.cloud == null) {
        const cloud = new wx.cloud.Cloud({
          resourceAppid: 'wxc4a691061fdb1ecc',
          resourceEnv: this.globalData.cloudEnv
        });
        this.cloud = cloud;
        await cloud.init();
        console.log('✅ 云开发初始化完成');
      }

      const result = await this.cloud.callContainer({
        path: path,
        method: options.method || 'GET',
        header: Object.assign({}, options.header, {
          'X-WX-SERVICE': this.globalData.cloudService
        }),
        data: options.data
      });

      return { statusCode: result.statusCode, data: result.data, header: result.header };
    } catch (e) {
      const error = e.toString();
      // 未初始化完成时自动重试（最多 3 次）
      if (error.indexOf("Cloud API isn't enabled") !== -1 && retryCount < 3) {
        console.log('⏳ 云开发未就绪，300ms 后重试...');
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this._callWithRetry(path, options, retryCount + 1));
          }, 300);
        });
      }
      throw new Error('云托管调用失败: ' + error);
    }
  }
})
