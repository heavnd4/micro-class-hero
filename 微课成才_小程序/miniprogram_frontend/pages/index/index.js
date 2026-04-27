const app = getApp()

Page({
  data: {
    isProcessing: false,
    currentStep: '待机中',
    progress: 0,
    videoUrl: '',
    questions: [],
    currentQIdx: 0,
    selectedIndices: [] // 记录当前选中的选项索引
  },

  onLoad() {
    this.setData({
      videoUrl: app.globalData.serverUrl + '/video/test_video.mp4'
    })
  },

  startProcess() {
    this.setData({ isProcessing: true })
    wx.request({
      url: app.globalData.serverUrl + '/api/start_process',
      method: 'POST',
      data: { video_name: 'test_video.mp4' },
      success: (res) => {
        this.pollStatus()
      },
      fail: () => {
        this.setData({ isProcessing: false })
        wx.showModal({
          title: '炼化炉未点火',
          content: '请确保你电脑上的那个黑窗口（app.py）正在运行',
          showCancel: false
        })
      }
    })
  },

  pollStatus() {
    const timer = setInterval(() => {
      wx.request({
        url: app.globalData.serverUrl + '/api/get_status',
        success: (res) => {
          this.setData({
            currentStep: res.data.current_step,
            progress: res.data.progress
          })
          if (res.data.current_step === '已完成') {
            clearInterval(timer)
            this.setData({ isProcessing: false })
            this.fetchQuestions()
          }
        }
      })
    }, 3000)
  },

  fetchQuestions() {
    wx.request({
      url: app.globalData.serverUrl + '/api/get_questions',
      success: (res) => {
        this.setData({ questions: res.data })
      }
    })
  },

  // 点击选项逻辑
  selectOption(e) {
    const { index } = e.currentTarget.dataset
    const currentQ = this.data.questions[this.data.currentQIdx]
    let { selectedIndices } = this.data

    if (currentQ.type === '单选题' || currentQ.type === '判断题') {
      // 单选：直接校验
      this.checkAnswer([index])
    } else if (currentQ.type === '多选题') {
      // 多选：切换选中状态
      const pos = selectedIndices.indexOf(index)
      if (pos > -1) {
        selectedIndices.splice(pos, 1)
      } else {
        selectedIndices.push(index)
      }
      this.setData({ selectedIndices })
    }
  },

  // 提交多选题答案
  submitMultiAnswer() {
    this.checkAnswer(this.data.selectedIndices)
  },

  checkAnswer(indices) {
    const currentQ = this.data.questions[this.data.currentQIdx]
    if (indices.length === 0) return

    // 拼接选中的选项字母，如 "AB"
    const userAns = indices.sort().map(i => currentQ.options[i].charAt(0)).join('')
    const correctAns = currentQ.answer

    if (userAns === correctAns) {
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
        content: '解析：' + currentQ.explanation,
        showCancel: false,
        success: () => {
          // 答错后清空多选状态
          this.setData({ selectedIndices: [] })
        }
      })
    }
  }
})