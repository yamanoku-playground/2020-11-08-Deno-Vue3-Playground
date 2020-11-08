export const Sample = {
  data: function () {
    return {
      count: 3
    }
  },
  methods: {
    countUp: function(){
      this.count++
    }
  },
  template: `
    <div>
      <p>{{ count }}</p>
      <button @click="countUp">count up</button>
    </div>
  `,
};
