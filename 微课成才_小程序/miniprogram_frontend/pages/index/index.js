const app = getApp()

Page({
  data: {
    isProcessing: false,
    currentStep: '待机中',
    progress: 0,
    videoUrl: '',
    questions: [],
    chapters: [],
    currentQIdx: 0,
    selectedIndices: [],
    shortAnswer: '',
    engineReady: false,     // 引擎是否就绪
    engineWarming: false,   // 引擎是否正在预热
    warmupCountdown: 0,     // 预热倒计时秒数
    debugMode: false,       // 调试模式（跳题按钮 + 秒过）
    backendAlive: false,    // 后端容器是否存活
    coldStarting: false     // 是否正在等待冷启动
  },

  onLoad() {
    this.videoContext = wx.createVideoContext('myVideo')
    this.setData({ debugMode: app.globalData.debugMode })
    // 第一步：先探测后端是否存活（不并发发请求，避免冷启动时全部超时）
    this.probeBackend()
  },

  /**
   * 探测后端容器是否存活，存活后再加载资源
   * 冷启动时容器可能需要 30-90 秒才能响应
   */
  probeBackend() {
    console.log('[探测] 检查后端容器状态...')
    this.setData({ coldStarting: true })

    app.api('/api/health').then(res => {
      // 后端存活了
      this.setData({ backendAlive: true, coldStarting: false })
      console.log('[探测] 后端容器已响应:', res.data.status)

      if (res.statusCode === 200 && res.data.status === 'ready') {
        this.setData({ engineReady: true })
      } else if (res.statusCode === 202) {
        // 引擎预热中，后端已存活，可以开始加载视频
        this.setData({ engineWarming: true })
        this.startWarmupCountdown(40)
      }

      // 后端存活了，等 2 秒让容器稳定一下再加载资源
      console.log('[探测] 后端已存活，2 秒后加载资源...')
      setTimeout(() => {
        this.loadVideoUrl()
      }, 2000)
    }).catch(err => {
      // 第一次探测失败 = 冷启动中
      console.log('[探测] 后端未响应（冷启动中），开始轮询等待...', err)
      this.pollBackendAlive()
    })
  },

  /**
   * 轮询等待后端容器冷启动完成
   * 每 5 秒探测一次，最多等 120 秒
   */
  pollBackendAlive() {
    let attempts = 0
    const maxAttempts = 24 // 24 * 5s = 120s

    const timer = setInterval(() => {
      attempts++
      console.log(`[探测] 第 ${attempts}/${maxAttempts} 次尝试...`)

      app.api('/api/health').then(res => {
        clearInterval(timer)
        this.setData({ backendAlive: true, coldStarting: false })
        console.log('[探测] 后端容器已响应！耗时约', attempts * 5, '秒')

        if (res.statusCode === 200 && res.data.status === 'ready') {
          this.setData({ engineReady: true })
        } else if (res.statusCode === 202) {
          this.setData({ engineWarming: true })
          this.startWarmupCountdown(40)
        }

        // 后端活了，等 2 秒再加载资源
        console.log('[探测] 后端已存活，2 秒后加载资源...')
        setTimeout(() => {
          this.loadVideoUrl()
        }, 2000)
      }).catch(() => {
        if (attempts >= maxAttempts) {
          clearInterval(timer)
          this.setData({ coldStarting: false })
          console.error('[探测] 后端容器 120 秒内未响应')
          wx.showModal({
            title: '后端服务未响应',
            content: '后端容器启动超时（可能正在冷启动），请点击确定重试',
            confirmText: '重试',
            showCancel: false,
            success: () => {
              this.probeBackend()
            }
          })
        }
        // 否则继续等...
      })
    }, 5000)
  },

  loadVideoUrl(retryCount = 0) {
    if (app.globalData.localMode) {
      this.setData({ videoUrl: app.globalData.localServerUrl + '/video/test_video.mp4' })
      return
    }
    // 云托管模式：通过 callContainer 调后端接口获取 COS 临时链接
    app.api('/api/get_video_url?video=test_video.mp4').then(res => {
      if (res.statusCode === 200 && res.data.url) {
        this.setData({ videoUrl: res.data.url })
        console.log('[视频] 加载成功')
      } else {
        console.log('[视频] 获取视频链接失败:', res.data)
        this._retryLoadVideo(retryCount)
      }
    }).catch(err => {
      console.log('[视频] 获取视频链接失败:', err)
      this._retryLoadVideo(retryCount)
    })
  },

  _retryLoadVideo(retryCount) {
    if (retryCount < 3) {
      const delay = 3000 * (retryCount + 1) // 3s, 6s, 9s
      console.log(`[视频] ${delay / 1000}s 后重试 (${retryCount + 1}/3)...`)
      setTimeout(() => {
        this.loadVideoUrl(retryCount + 1)
      }, delay)
    } else {
      console.warn('[视频] 重试 3 次仍失败，放弃')
    }
  },

  startWarmupCountdown(seconds) {
    this.setData({ warmupCountdown: seconds })
    const timer = setInterval(() => {
      const remaining = this.data.warmupCountdown - 1
      if (remaining <= 0) {
        clearInterval(timer)
        this.setData({ warmupCountdown: 0 })
        this.checkEngineReady()
        return
      }
      this.setData({ warmupCountdown: remaining })
    }, 1000)

    const checkTimer = setInterval(() => {
      if (this.data.engineReady) {
        clearInterval(checkTimer)
        clearInterval(timer)
        return
      }
      this.checkEngineReady()
      if (this.data.engineReady) {
        clearInterval(timer)
        clearInterval(checkTimer)
      }
    }, 5000)
  },

  checkEngineReady() {
    app.api('/api/engine_status').then(res => {
      if (res.data && res.data.ready) {
        this.setData({ engineReady: true, engineWarming: false, warmupCountdown: 0 })
      }
    }).catch(() => {
      // 静默失败，下次定时器会再检查
    })
  },

  startProcess() {
    if (!this.data.engineReady && this.data.engineWarming) {
      wx.showModal({
        title: '炼化炉预热中',
        content: `模型正在加载，预计还需 ${this.data.warmupCountdown} 秒，请稍后再试`,
        showCancel: false
      })
      return
    }
    if (!this.data.backendAlive) {
      wx.showModal({
        title: '后端未就绪',
        content: '正在等待后端容器启动，请稍后再试',
        showCancel: false
      })
      return
    }

    this.setData({ isProcessing: true })
    app.api('/api/start_process', {
      method: 'POST',
      data: { video_name: 'test_video.mp4' }
    }).then(res => {
      if (res.data.status === 'error') {
        this.setData({ isProcessing: false })
        if (res.data.message.includes('预热')) {
          this.warmupEngine()
          wx.showModal({
            title: '炼化炉预热中',
            content: '首次启动需要加载 AI 模型，请等待约 30 秒后重试',
            showCancel: false
          })
        } else {
          wx.showModal({
            title: '出错了',
            content: res.data.message,
            showCancel: false
          })
        }
        return
      }
      this.pollStatus()
    }).catch(() => {
      this.setData({ isProcessing: false })
      wx.showModal({
        title: '连接失败',
        content: '请检查网络连接，或确认后端服务正在运行',
        showCancel: false
      })
    })
  },

  warmupEngine() {
    app.api('/api/health').then(res => {
      if (res.statusCode === 200 && res.data.status === 'ready') {
        this.setData({ engineReady: true, engineWarming: false })
      } else if (res.statusCode === 202) {
        this.setData({ engineWarming: true })
        this.startWarmupCountdown(40)
      }
    }).catch(() => {})
  },

  pollStatus() {
    const timer = setInterval(() => {
      app.api('/api/get_status').then(res => {
        const { current_step, progress } = res.data
        this.setData({
          currentStep: current_step,
          progress: Math.max(progress, 0)
        })
        if (current_step === '已完成') {
          clearInterval(timer)
          this.setData({ isProcessing: false })
          this.fetchData()
        }
        if (progress === -1 || current_step.startsWith('炼化失败')) {
          clearInterval(timer)
          this.setData({ isProcessing: false })
          wx.showModal({
            title: '炼化失败',
            content: current_step.replace('炼化失败: ', ''),
            showCancel: false
          })
        }
      }).catch(() => {
        clearInterval(timer)
        this.setData({ isProcessing: false })
        wx.showToast({ title: '连接断开', icon: 'none' })
      })
    }, 3000)
  },

  fetchData() {
    app.api('/api/get_questions').then(res => {
      this.setData({ questions: res.data })
    })
    app.api('/api/get_lecture').then(res => {
      this.setData({ chapters: res.data.chapters || [] })
    })
  },

  selectOption(e) {
    const { index } = e.currentTarget.dataset
    const currentQ = this.data.questions[this.data.currentQIdx]
    let { selectedIndices } = this.data

    if (currentQ.type === '单选题' || currentQ.type === '判断题') {
      if (this.data.debugMode) {
        this.setData({ currentQIdx: this.data.currentQIdx + 1, selectedIndices: [] })
        return
      }
      this.checkAnswer([index])
    } else if (currentQ.type === '多选题') {
      const pos = selectedIndices.indexOf(index)
      if (pos > -1) {
        selectedIndices.splice(pos, 1)
      } else {
        selectedIndices.push(index)
      }
      this.setData({ selectedIndices })
    }
  },

  submitMultiAnswer() {
    if (this.data.debugMode) {
      this.setData({ currentQIdx: this.data.currentQIdx + 1, selectedIndices: [] })
      return
    }
    this.checkAnswer(this.data.selectedIndices)
  },

  checkAnswer(indices) {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (indices.length === 0) return

    const userAns = indices.sort().map(i => {
      const opt = currentQ.options[i]
      if (currentQ.type === '判断题') return opt
      return opt.charAt(0)
    })
    let correctAns = currentQ.answer
    if (!Array.isArray(correctAns)) {
      correctAns = [correctAns]
    }

    const isCorrect = userAns.length === correctAns.length &&
      userAns.every((val, idx) => val === correctAns[idx])

    if (isCorrect) {
      wx.showToast({ title: '炼化成功！', icon: 'success' })
      setTimeout(() => {
        this.setData({
          currentQIdx: this.data.currentQIdx + 1,
          selectedIndices: []
        })
      }, 1500)
    } else {
      wx.showModal({
        title: '炼化偏差',
        content: '感悟不够深刻，是否回到视频中重新研读？',
        confirmText: '看解析',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) {
            this.jumpToVideoSource()
          }
          this.setData({ selectedIndices: [] })
        }
      })
    }
  },

  onShortAnswerInput(e) {
    this.setData({ shortAnswer: e.detail.value })
  },

  submitShortAnswer() {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (this.data.debugMode) {
      wx.showModal({
        title: '参考答案',
        content: currentQ.answer,
        confirmText: '下一题',
        showCancel: false,
        success: () => {
          this.setData({ currentQIdx: this.data.currentQIdx + 1, shortAnswer: '' })
        }
      })
      this.setData({ shortAnswer: '' })
      return
    }
    if (!this.data.shortAnswer.trim()) return

    wx.showModal({
      title: '参考答案',
      content: currentQ.answer,
      confirmText: '下一题',
      cancelText: '看解析',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            currentQIdx: this.data.currentQIdx + 1,
            shortAnswer: ''
          })
        } else if (res.cancel) {
          wx.showModal({
            title: '解析',
            content: currentQ['解析'] || '暂无解析',
            showCancel: false,
            success: () => {
              this.setData({
                currentQIdx: this.data.currentQIdx + 1,
                shortAnswer: ''
              })
            }
          })
        }
      }
    })
    this.setData({ shortAnswer: '' })
  },

  exitQuiz() {
    this.setData({
      questions: [],
      currentQIdx: 0,
      selectedIndices: [],
      shortAnswer: ''
    })
  },

  // ===== 调试模式：跳题功能 =====

  skipToType(e) {
    const { type } = e.currentTarget.dataset
    const questions = this.data.questions
    for (let i = this.data.currentQIdx; i < questions.length; i++) {
      if (questions[i].type === type) {
        this.setData({ currentQIdx: i, selectedIndices: [], shortAnswer: '' })
        return
      }
    }
    wx.showToast({ title: '后面没有该题型了', icon: 'none' })
  },

  skipToLast() {
    const lastIdx = this.data.questions.length - 1
    this.setData({ currentQIdx: lastIdx, selectedIndices: [], shortAnswer: '' })
  },

  skipToQuestion() {
    const total = this.data.questions.length
    wx.showActionSheet({
      itemList: Array.from({ length: total }, (_, i) => `第 ${i + 1} 题 (${this.data.questions[i].type})`),
      success: (res) => {
        this.setData({ currentQIdx: res.tapIndex, selectedIndices: [], shortAnswer: '' })
      }
    })
  },

  jumpToVideoSource() {
    const chapterIdx = Math.floor(this.data.currentQIdx / 4)
    const chapter = this.data.chapters[chapterIdx]

    if (chapter && chapter.timestamp !== undefined) {
      wx.showToast({ title: '回溯到：' + chapter.title, icon: 'none' })
      this.videoContext.seek(chapter.timestamp)
      this.videoContext.play()
      wx.pageScrollTo({ selector: '#myVideo', duration: 300 })
    } else {
      wx.showToast({ title: '该知识点暂无回溯点', icon: 'none' })
    }
  }
})
