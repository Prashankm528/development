import { LightningElement, wire, track } from 'lwc';
import getData from '@salesforce/apex/CovidClassLightning.callValue';

export default class CoVid19India extends LightningElement {
    @track allData = [] ;
    @track active;
    @track confirmed;
    @track death;
    @track iconShow = 'utility:chevronright';
    connectedCallback(){
        this.getAlldata();
        
    }
    
    getAlldata(){
        getData()
            .then(result => {
                this.allData = result;
                this.active = result[0].active;
                this.confirmed = result[0].confirmed;
                
            })
            .catch(error => {
               
                this.allData = undefined;
            });
    }

    toggle(){
        
        if(this.iconShow === 'utility:chevronright'){
            alert('Pnk');
            this.iconShow = 'utility:chevrondown';
        }
        else{
            this.iconShow = 'utility:chevronright';
        }
    }
       

   get getTime(){
     var today = new Date();
     var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()+ '-' + today.getHours() + ":" + today.getMinutes();
     return date;
   }

}