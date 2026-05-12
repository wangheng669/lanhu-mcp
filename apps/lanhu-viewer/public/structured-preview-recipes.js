(function registerStructuredPreviewRecipes(global) {
  const recipes = [
    {
      id: 'lanhu-520-lamp-v1',
      label: '520灯牌【5/2/0】',
      match: {
        designIds: [
          '102e0c4b-9d87-433b-8616-742bff847d36',
          '6830f732-ae61-4980-9e4b-211bb050b733',
          'f4e0c1e7-e327-4b25-86e7-edb4a478c946'
        ],
        designNamePattern: /^520灯牌【[520]】$/
      },
      builders: [
        { method: 'build520LampPixelPerfectGeneratedPreviewHtml' },
        { method: 'build520LampStructuredGeneratedPreviewHtml' }
      ],
      options: {
        fixedCanvasPreset: 'lanhu-520-lamp',
        canvasSize: {
          width: 750,
          height: 5240
        },
        coverCrops: [
          {
            cropX: 0,
            cropY: 5112,
            cropWidth: 750,
            cropHeight: 128,
            x: 0,
            y: 5112,
            width: 750,
            height: 128,
            z: 18,
            className: 'bottom-component-crop',
            alt: '底部导航'
          },
          {
            cropX: 196,
            cropY: 661,
            cropWidth: 118,
            cropHeight: 118,
            x: 196,
            y: 661,
            width: 118,
            height: 118,
            z: 7,
            className: 'avatar-crop avatar-crop-left',
            alt: '左头像'
          },
          {
            cropX: 438,
            cropY: 661,
            cropWidth: 118,
            cropHeight: 118,
            x: 438,
            y: 661,
            width: 118,
            height: 118,
            z: 7,
            className: 'avatar-crop avatar-crop-right',
            alt: '右头像'
          }
        ]
      }
    }
  ];

  global.LANHU_STRUCTURED_PREVIEW_RECIPES = recipes;
})(window);
