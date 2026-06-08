(function(){
  if (typeof Vue === 'undefined' && typeof window.Vue === 'undefined') {
    console.warn('Vue global not found. Please include Vue 3 global build before this script.');
    return;
  }
  var V = window.Vue || Vue;

  var MeApp = {
    template: `\
      <div class="miffy-me-widget" style="padding:12px">\
        <div style="display:flex;align-items:center;gap:12px">\
          <div @click="edit('avatar')" :style="avatarStyle" style="width:65px;height:65px;border-radius:18px;cursor:pointer;background-size:cover"></div>\
          <div style="flex:1">\
            <div @click="edit('name')" style="font-size:18px;font-weight:700;cursor:pointer">{{ profile.name }}</div>\
            <div @click="edit('id')" style="font-size:12px;color:var(--text-gray,#a39ea0);cursor:pointer">ID: {{ profile.id }}</div>\
          </div>\
        </div>\
      </div>\
    `,
    data: function(){ return { profile: { name: 'Miffy', id: 'miffy_yoo', avatar: '' } } },
    methods: {
      load: function(){ try{ var raw=localStorage.getItem('miffy_profile_v1'); this.profile = raw?JSON.parse(raw):this.profile }catch(e){} },
      save: function(){ try{ localStorage.setItem('miffy_profile_v1', JSON.stringify(this.profile||{})) }catch(e){} },
      avatarStyle: function(){ if(this.profile && this.profile.avatar) return { backgroundImage: 'url(' + this.profile.avatar + ')' }; return { background: 'linear-gradient(135deg,#ffecd2,#fcb69f)' } },
      edit: function(field){ var cur = this.profile[field] || ''; var val = prompt('修改' + (field==='avatar'?'头像URL':(field==='name'?'昵称':'ID')), cur); if(val===null) return; this.profile[field] = (val||'').trim(); if(field==='name' && !this.profile.name) this.profile.name='Miffy'; if(field==='id' && !this.profile.id) this.profile.id='miffy_yoo'; this.save(); }
    },
    mounted: function(){ this.load() }
  }

  var el = document.getElementById('miffy-me')
  if (el) {
    V.createApp(MeApp).mount(el)
  } else {
    window.MiffyMeMount = function(selectorOrEl){ var target = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl; if(target) V.createApp(MeApp).mount(target); }
  }
})();
