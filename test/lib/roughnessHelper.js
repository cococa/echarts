/**
 * Roughness Helper
 * 用于自动为手绘风格图表应用自定义字体
 */
(function(global) {
    'use strict';

    const HAND_DRAWN_FONT = 'JinNianYeYaoJiaYouYa, sans-serif';

    /**
     * 深度遍历对象，为所有文本样式添加字体
     */
    function applyFontToOption(option, fontFamily) {
        if (!option || typeof option !== 'object') {
            return option;
        }

        // 处理数组
        if (Array.isArray(option)) {
            return option.map(item => applyFontToOption(item, fontFamily));
        }

        // 克隆对象
        const result = {};
        
        for (let key in option) {
            if (!option.hasOwnProperty(key)) continue;
            
            const value = option[key];
            
            // 处理 textStyle
            if (key === 'textStyle' && typeof value === 'object') {
                result[key] = Object.assign({}, value);
                if (!result[key].fontFamily) {
                    result[key].fontFamily = fontFamily;
                }
            }
            // 处理 axisLabel
            else if (key === 'axisLabel' && typeof value === 'object') {
                result[key] = Object.assign({}, value);
                if (!result[key].fontFamily) {
                    result[key].fontFamily = fontFamily;
                }
            }
            // 处理 label
            else if (key === 'label' && typeof value === 'object') {
                result[key] = Object.assign({}, value);
                if (!result[key].fontFamily) {
                    result[key].fontFamily = fontFamily;
                }
            }
            // 递归处理其他对象
            else if (typeof value === 'object' && value !== null) {
                result[key] = applyFontToOption(value, fontFamily);
            }
            else {
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * 创建带有手绘风格的图表
     * @param {HTMLElement|string} dom - 容器元素或 ID
     * @param {Object} theme - 主题
     * @param {Object} opts - 初始化选项
     * @param {number} opts.roughness - 手绘粗糙度
     * @param {string} opts.filler - 填充样式
     * @param {string} opts.handDrawnFont - 自定义字体（可选）
     * @returns {ECharts} ECharts 实例
     */
    function createHandDrawnChart(echarts, dom, theme, opts) {
        opts = opts || {};
        
        // 如果没有设置 roughness，默认为 5
        if (opts.roughness === undefined) {
            opts.roughness = 5;
        }
        
        const chart = echarts.init(dom, theme, opts);
        
        // 如果设置了 roughness，包装 setOption 方法
        if (opts.roughness > 0) {
            const originalSetOption = chart.setOption.bind(chart);
            const fontFamily = opts.handDrawnFont || HAND_DRAWN_FONT;
            
            chart.setOption = function(option, notMerge, lazyUpdate) {
                // 自动应用字体
                const modifiedOption = applyFontToOption(option, fontFamily);
                return originalSetOption(modifiedOption, notMerge, lazyUpdate);
            };
        }
        
        return chart;
    }

    /**
     * 等待字体加载完成
     * @param {string} fontFamily - 字体名称
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise}
     */
    function waitForFont(fontFamily, timeout) {
        timeout = timeout || 3000;
        
        if (!document.fonts) {
            // 如果浏览器不支持 Font Loading API，直接返回
            return Promise.resolve();
        }
        
        return Promise.race([
            document.fonts.load('12px ' + fontFamily),
            new Promise((resolve) => setTimeout(resolve, timeout))
        ]);
    }

    // 导出到全局
    global.roughnessHelper = {
        createHandDrawnChart: createHandDrawnChart,
        applyFontToOption: applyFontToOption,
        waitForFont: waitForFont,
        HAND_DRAWN_FONT: HAND_DRAWN_FONT
    };

})(window);