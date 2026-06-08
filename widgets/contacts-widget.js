(function(){
  if (typeof Vue === 'undefined' && typeof window.Vue === 'undefined') {
    console.warn('Vue global not found. Please include Vue 3 global build before this script.');
    return;
  }
  var V = window.Vue || Vue;

  var ContactsApp = {
    template: `\
      <div class="miffy-contacts-widget">\
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px">\
          <div style="font-weight:700">联系人</div>\
          <div>\
            <button @click="onAdd" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(212,165,180,0.18);background:white;cursor:pointer">+ 添加</button>\
          </div>\
        </div>\
        <div v-if="list.length===0" style="padding:12px;color:var(--text-gray,#a39ea0)">暂无自建联系人</div>\
        <div v-for="(c,idx) in ordered" :key="idx" style="padding:10px 12px;border-top:1px solid rgba(0,0,0,0.03);display:flex;align-items:center;gap:12px">\
          <div :style="avatarStyle(c)" style="width:40px;height:40px;border-radius:12px;flex-shrink:0;background-size:cover"></div>\
          <div style="flex:1">\
            <div style="font-weight:600">{{ c.name || c.callName || 'Unnamed' }}</div>\
            <div style="font-size:12px;color:var(--text-gray,#a39ea0)">{{ c.callName || '' }}</div>\
          </div>\
        </div>\
      </div>\
    `,
    data: function(){ return { list: [] } },
    computed: {
      ordered: function(){ return (this.list||[]).slice().reverse() }
    },
    methods: {
      load: function(){ try{ var raw=localStorage.getItem('miffy_contacts_v1'); this.list = raw?JSON.parse(raw):[] }catch(e){ this.list=[] } },
      save: function(){ try{ localStorage.setItem('miffy_contacts_v1', JSON.stringify(this.list||[])) }catch(e){} },
      avatarStyle: function(c){ if(c && c.avatar) return { backgroundImage: 'url(' + c.avatar + ')' }; return { background: 'linear-gradient(135deg,#f0e4e8,#d4a5b4)' } },
      onAdd: function(){ var name = prompt('昵称'); if(!name) return; var callName = prompt('称呼(可选)')||''; var avatar = prompt('头像URL(可选)')||''; this.list.push({ name: name.trim(), callName: callName.trim(), avatar: avatar.trim() }); this.save(); }
    },
    mounted: function(){ this.load() }
  }

  // auto mount if container exists
  var el = document.getElementById('miffy-contacts')
  if (el) {
    V.createApp(ContactsApp).mount(el)
  } else {
    // expose mount function
    window.MiffyContactsMount = function(selectorOrEl){ var target = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl; if(target) V.createApp(ContactsApp).mount(target); }
  }
})();
