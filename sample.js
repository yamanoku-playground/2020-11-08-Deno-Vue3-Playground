export const Sample = {
  data: function () {
    return {
      count: 3
    }
  },
  methods: {
    countUp: function(){
      this.count++
    },
    countDown: function(){
      this.count--
    }
  },
  template: `
    <div>
      <p>{{ count }}</p>
      <button @click="countUp">count up</button>
      <button @click="countDown">count down</button>
    </div>
  `,
};
