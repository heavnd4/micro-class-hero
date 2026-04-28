App({
  onLaunch() {
    console.log('小程序启动');
    this.cloud = null;
    this.cloudInitPromise = null;
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
          timeout: 30000,
          success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
          fail: reject
        });
      });
    }

    // 云托管模式：懒初始化 cloud + 冷启动容错
    return this._callWithRetry(path, { method, data, header }, 0);
  },

  /**
   * 探测接口：判断后端容器是否存活（用于冷启动恢复）
   * 与 api 不同的是：这个方法失败时返回 false 而不是抛异常
   */
  async probe() {
    try {
      const res = await this.api('/api/health', { _silent: true });
      return { statusCode: res.statusCode, data: res.data };
    } catch (e) {
      return false;
    }
  },

  /**
   * 确保云开发已初始化（防止并发重复初始化）
   */
  async _ensureCloud() {
    if (this.cloud && this.cloudInitPromise) {
      return this.cloud;
    }
    if (!this.cloudInitPromise) {
      this.cloudInitPromise = this._initCloud();
    }
    return this.cloudInitPromise;
  },

  async _initCloud() {
    try {
      const cloud = new wx.cloud.Cloud({
        resourceAppid: 'wxc4a691061fdb1ecc',
        resourceEnv: this.globalData.cloudEnv
      });
      await cloud.init();
      this.cloud = cloud;
      console.log('✅ 云开发初始化完成');
      return cloud;
    } catch (e) {
      this.cloudInitPromise = null;
      throw e;
    }
  },

  async _callWithRetry(path, options, retryCount) {
    const maxRetries = 3;
    try {
      const cloud = await this._ensureCloud();

      // 根据接口类型设置不同超时：探测类短一些，业务类长一些
      const isProbe = path.indexOf('/api/health') !== -1 || path.indexOf('/api/engine_status') !== -1;
      const timeout = isProbe ? 10000 : 30000; // 探测 10s，业务 30s

      const result = await cloud.callContainer({
        path: path,
        method: options.method || 'GET',
        header: Object.assign({}, options.header, {
          'X-WX-SERVICE': this.globalData.cloudService
        }),
        data: options.data,
        timeout: timeout
      });

      return { statusCode: result.statusCode, data: result.data, header: result.header };
    } catch (e) {
      const error = e.toString();
      console.warn(`[API Error] path=${path} retry=${retryCount} error=${error}`);

      // 场景1：云开发未初始化完成 → 重置后重试
      if (error.indexOf("Cloud API isn't enabled") !== -1 && retryCount < maxRetries) {
        this.cloudInitPromise = null;
        console.log('⏳ 云开发未就绪，1s 后重试...');
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this._callWithRetry(path, options, retryCount + 1));
          }, 1000);
        });
      }

      // 场景2：超时（冷启动）→ 递增延迟重试
      if ((error.indexOf('timeout') !== -1 || error.indexOf('Timeout') !== -1) && retryCount < maxRetries) {
        const delay = 5000 * (retryCount + 1); // 5s, 10s, 15s
        console.log(`⏳ 请求超时（可能冷启动），${delay / 1000}s 后重试...`);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this._callWithRetry(path, options, retryCount + 1));
          }, delay);
        });
      }

      // 场景3：其他失败 → 重试一次
      if (error.indexOf('fail') !== -1 && retryCount < 1) {
        console.log('⏳ 请求失败，2s 后重试...');
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(this._callWithRetry(path, options, retryCount + 1));
          }, 2000);
        });
      }

      throw new Error('云托管调用失败: ' + error);
    }
  }
})
